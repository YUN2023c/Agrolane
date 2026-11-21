'use strict';
/** 主体（供方 / 买方 / 需求）增删改查 + 收藏 */
const express = require('express');
const db = require('../db');
const geo = require('../geo');

const router = express.Router();

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

function catMonths(catId) {
  const c = db.get('SELECT months FROM categories WHERE id = ?', [catId]);
  return db.json(c && c.months, []);
}


/* ---------------- 供方 ---------------- */
function supplierCatsRows(supplierId) {
  return db.all(
    `SELECT sc.*, c.name AS cat_name FROM supplier_cats sc
     JOIN categories c ON c.id = sc.cat_id
     WHERE sc.supplier_id = ? ORDER BY sc.id`,
    [supplierId]
  ).map((r) => ({
    id: r.id,
    catId: r.cat_id,
    catName: r.cat_name,
    variety: r.variety,
    area: r.area,
    supply: r.supply,
    months: db.json(r.months, []),
    gradeA: r.grade_a,
    price: r.price,
    priceHigh: r.price_high,
  }));
}

function mapSupplier(r, withCats = false) {
  const out = {
    id: r.id,
    name: r.name,
    village: r.village,
    regionId: r.region_id,
    regionName: r.region_name || null,
    level: r.level,
    acreage: r.acreage,
    coop: r.coop,
    credit: r.credit,
    fulfillment: r.fulfillment,
    privateSales: r.private_sales,
    certs: db.json(r.certs, []),
    stalled: !!r.stalled,
    deals: r.deals,
    phone: r.phone,
    capacityFactor: r.capacity_factor,
    joined: r.joined,
    lat: r.lat,
    lng: r.lng,
    geohash: r.geohash,
  };
  if (withCats) out.cats = supplierCatsRows(r.id);
  else {
    out.catNames = db.all('SELECT c.name FROM supplier_cats sc JOIN categories c ON c.id = sc.cat_id WHERE sc.supplier_id = ?', [r.id]).map((x) => x.name);
    const agg = db.get('SELECT SUM(supply) AS qty, MIN(price) AS min_price, MAX(grade_a) AS ga FROM supplier_cats WHERE supplier_id = ?', [r.id]);
    out.supplyTotal = Math.round((agg.qty || 0) * 10) / 10;
    out.minPrice = agg.min_price;
    out.gradeA = agg.ga;
  }
  return out;
}

router.get('/suppliers', (req, res) => {
  const { q, catId, regionId, level, cert, stalled, sort = 'credit', page = 1, pageSize = 20 } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(s.name LIKE ? OR s.village LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (regionId) { where.push('s.region_id = ?'); params.push(regionId); }
  if (level) { where.push('s.level = ?'); params.push(level); }
  if (cert) { where.push('s.certs LIKE ?'); params.push(`%${cert}%`); }
  if (stalled === '1') where.push('s.stalled = 1');
  if (catId) {
    where.push('EXISTS (SELECT 1 FROM supplier_cats sc WHERE sc.supplier_id = s.id AND sc.cat_id = ?)');
    params.push(catId);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sorts = {
    credit: 's.credit DESC',
    fulfillment: 's.fulfillment DESC',
    acreage: 's.acreage DESC',
    deals: 's.deals DESC',
    new: 's.created_at DESC',
  };
  const total = db.get(`SELECT COUNT(*) AS n FROM suppliers s ${whereSql}`, params).n;
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const rows = db.all(
    `SELECT s.*, r.name AS region_name FROM suppliers s
     LEFT JOIN regions r ON r.id = s.region_id
     ${whereSql} ORDER BY ${sorts[sort] || sorts.credit} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ total, page: Number(page) || 1, pageSize: limit, items: rows.map((r) => mapSupplier(r)) });
});

router.get('/suppliers/:id', (req, res) => {
  const r = db.get(
    'SELECT s.*, r.name AS region_name FROM suppliers s LEFT JOIN regions r ON r.id = s.region_id WHERE s.id = ?',
    [req.params.id]
  );
  if (!r) return bad(res, '供方不存在', 404);
  const out = mapSupplier(r, true);
  out.recentMatches = db.all(
    'SELECT * FROM matches WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 5',
    [req.params.id]
  ).map((m) => ({ ...m, subs: db.json(m.subs, {}) }));
  res.json(out);
});

function entityPayload(body) {
  const errs = [];
  if (!body.name || String(body.name).trim().length < 2) errs.push('名称至少 2 个字');
  if (!body.regionId) errs.push('缺少所属区域');
  if (!Array.isArray(body.cats) || body.cats.length === 0) errs.push('至少填写一个品类');
  return errs;
}

router.post('/suppliers', (req, res) => {
  const errs = entityPayload(req.body);
  if (errs.length) return bad(res, errs.join('；'));
  const region = db.get('SELECT * FROM regions WHERE id = ?', [req.body.regionId]);
  if (!region) return bad(res, '区域不存在');
  const id = req.body.id && /^S\d{3,}$/.test(req.body.id) && !db.get('SELECT 1 FROM suppliers WHERE id = ?', [req.body.id])
    ? req.body.id
    : 'S' + String((db.get('SELECT COUNT(*) AS n FROM suppliers').n + 1)).padStart(3, '0');
  const lat = Number(req.body.lat) || region.lat;
  const lng = Number(req.body.lng) || region.lng;

  db.tx(() => {
    db.run(
      `INSERT INTO suppliers(id,name,village,region_id,level,acreage,coop,credit,fulfillment,private_sales,
        certs,stalled,deals,phone,capacity_factor,joined,lat,lng,geohash,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, String(req.body.name).trim(), req.body.village || region.name,
        req.body.regionId, req.body.level || '家庭农场', Number(req.body.acreage) || 10,
        req.body.coop || null, Number(req.body.credit) || 70, Number(req.body.fulfillment) || 85,
        Number(req.body.privateSales) || 0, JSON.stringify(req.body.certs || []),
        req.body.stalled ? 1 : 0, Number(req.body.deals) || 0, req.body.phone || null,
        Number(req.body.capacityFactor) || 0.8, req.body.joined || new Date().toISOString().slice(0, 7),
        lat, lng, geo.encode(lat, lng, 7), new Date().toISOString()]
    );
    req.body.cats.forEach((c) => {
      db.run(
        `INSERT INTO supplier_cats(supplier_id,cat_id,variety,area,supply,months,grade_a,price,price_high)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, c.catId, c.variety || null, Number(c.area) || 5, Number(c.supply) || 1,
          JSON.stringify(Array.isArray(c.months) && c.months.length ? c.months : catMonths(c.catId)),
          Number(c.gradeA) || 70, Number(c.price) || 0,
          Number(c.priceHigh) || Number(c.price) || 0]
      );
    });
  });
  res.status(201).json(mapSupplier(db.get('SELECT * FROM suppliers WHERE id = ?', [id]), true));
});

router.patch('/suppliers/:id', (req, res) => {
  const cur = db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
  if (!cur) return bad(res, '供方不存在', 404);
  const b = req.body;
  let lat = cur.lat, lng = cur.lng;
  if (b.regionId && b.regionId !== cur.region_id) {
    const region = db.get('SELECT * FROM regions WHERE id = ?', [b.regionId]);
    if (!region) return bad(res, '区域不存在');
    lat = region.lat; lng = region.lng;
  }
  db.tx(() => {
    db.run(
      `UPDATE suppliers SET name=?,village=?,region_id=?,level=?,acreage=?,coop=?,credit=?,fulfillment=?,
        private_sales=?,certs=?,stalled=?,deals=?,phone=?,capacity_factor=?,joined=?,lat=?,lng=?,geohash=?
       WHERE id=?`,
      [b.name ?? cur.name, b.village ?? cur.village, b.regionId ?? cur.region_id,
        b.level ?? cur.level, Number(b.acreage ?? cur.acreage), b.coop ?? cur.coop,
        Number(b.credit ?? cur.credit), Number(b.fulfillment ?? cur.fulfillment),
        Number(b.privateSales ?? cur.private_sales),
        JSON.stringify(b.certs ?? db.json(cur.certs, [])),
        b.stalled === undefined ? cur.stalled : (b.stalled ? 1 : 0),
        Number(b.deals ?? cur.deals), b.phone ?? cur.phone,
        Number(b.capacityFactor ?? cur.capacity_factor), b.joined ?? cur.joined,
        lat, lng, geo.encode(lat, lng, 7), req.params.id]
    );
    if (Array.isArray(b.cats)) {
      db.run('DELETE FROM supplier_cats WHERE supplier_id = ?', [req.params.id]);
      b.cats.forEach((c) => {
        db.run(
          `INSERT INTO supplier_cats(supplier_id,cat_id,variety,area,supply,months,grade_a,price,price_high)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [req.params.id, c.catId, c.variety || null, Number(c.area) || 5, Number(c.supply) || 1,
            JSON.stringify(Array.isArray(c.months) && c.months.length ? c.months : catMonths(c.catId)),
            Number(c.gradeA) || 70, Number(c.price) || 0,
            Number(c.priceHigh) || Number(c.price) || 0]
        );
      });
    }
  });
  res.json(mapSupplier(db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id]), true));
});

router.delete('/suppliers/:id', (req, res) => {
  const cur = db.get('SELECT 1 FROM suppliers WHERE id = ?', [req.params.id]);
  if (!cur) return bad(res, '供方不存在', 404);
  db.run('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
  res.json({ ok: true, id: req.params.id });
});

/* ---------------- 买方 ---------------- */
function mapBuyer(r, withDemands = false) {
  const out = {
    id: r.id, name: r.name, type: r.type, regionId: r.region_id, regionName: r.region_name || null,
    credit: r.credit, fulfillment: r.fulfillment, payDays: r.pay_days, phone: r.phone, since: r.since,
    lat: r.lat, lng: r.lng, geohash: r.geohash,
    cats: db.all('SELECT cat_id FROM buyer_cats WHERE buyer_id = ?', [r.id]).map((x) => x.cat_id),
    demandCount: db.get('SELECT COUNT(*) AS n FROM demands WHERE buyer_id = ?', [r.id]).n,
    demandQty: Math.round((db.get('SELECT COALESCE(SUM(qty),0) AS q FROM demands WHERE buyer_id = ?', [r.id]).q) * 10) / 10,
  };
  if (withDemands) out.demands = demandList({ buyerId: r.id });
  return out;
}

router.get('/buyers', (req, res) => {
  const { q, type, regionId, page = 1, pageSize = 20 } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('b.name LIKE ?'); params.push(`%${q}%`); }
  if (type) { where.push('b.type = ?'); params.push(type); }
  if (regionId) { where.push('b.region_id = ?'); params.push(regionId); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM buyers b ${whereSql}`, params).n;
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const rows = db.all(
    `SELECT b.*, r.name AS region_name FROM buyers b LEFT JOIN regions r ON r.id = b.region_id
     ${whereSql} ORDER BY b.credit DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ total, page: Number(page) || 1, pageSize: limit, items: rows.map((r) => mapBuyer(r)) });
});

router.get('/buyers/:id', (req, res) => {
  const r = db.get('SELECT b.*, r.name AS region_name FROM buyers b LEFT JOIN regions r ON r.id = b.region_id WHERE b.id = ?', [req.params.id]);
  if (!r) return bad(res, '买方不存在', 404);
  res.json(mapBuyer(r, true));
});

router.post('/buyers', (req, res) => {
  if (!req.body.name) return bad(res, '缺少企业名称');
  if (!req.body.regionId) return bad(res, '缺少所属区域');
  const region = db.get('SELECT * FROM regions WHERE id = ?', [req.body.regionId]);
  if (!region) return bad(res, '区域不存在');
  const id = 'B' + String(db.get('SELECT COUNT(*) AS n FROM buyers').n + 1).padStart(2, '0');
  const lat = Number(req.body.lat) || region.lat;
  const lng = Number(req.body.lng) || region.lng;
  db.tx(() => {
    db.run(
      `INSERT INTO buyers(id,name,type,region_id,credit,fulfillment,pay_days,phone,since,lat,lng,geohash)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.body.name, req.body.type || '水果店', req.body.regionId,
        Number(req.body.credit) || 75, Number(req.body.fulfillment) || 85,
        Number(req.body.payDays) || 30, req.body.phone || null,
        req.body.since || new Date().toISOString().slice(0, 7),
        lat, lng, geo.encode(lat, lng, 7)]
    );
    (req.body.cats || []).forEach((c) => db.run('INSERT INTO buyer_cats(buyer_id,cat_id) VALUES (?,?)', [id, c]));
  });
  res.status(201).json(mapBuyer(db.get('SELECT * FROM buyers WHERE id = ?', [id]), true));
});

router.patch('/buyers/:id', (req, res) => {
  const cur = db.get('SELECT * FROM buyers WHERE id = ?', [req.params.id]);
  if (!cur) return bad(res, '买方不存在', 404);
  const b = req.body;
  db.tx(() => {
    db.run(
      `UPDATE buyers SET name=?,type=?,region_id=?,credit=?,fulfillment=?,pay_days=?,phone=?,since=? WHERE id=?`,
      [b.name ?? cur.name, b.type ?? cur.type, b.regionId ?? cur.region_id,
        Number(b.credit ?? cur.credit), Number(b.fulfillment ?? cur.fulfillment),
        Number(b.payDays ?? cur.pay_days), b.phone ?? cur.phone, b.since ?? cur.since, req.params.id]
    );
    if (Array.isArray(b.cats)) {
      db.run('DELETE FROM buyer_cats WHERE buyer_id = ?', [req.params.id]);
      b.cats.forEach((c) => db.run('INSERT INTO buyer_cats(buyer_id,cat_id) VALUES (?,?)', [req.params.id, c]));
    }
  });
  res.json(mapBuyer(db.get('SELECT * FROM buyers WHERE id = ?', [req.params.id]), true));
});

router.delete('/buyers/:id', (req, res) => {
  if (!db.get('SELECT 1 FROM buyers WHERE id = ?', [req.params.id])) return bad(res, '买方不存在', 404);
  db.run('DELETE FROM buyers WHERE id = ?', [req.params.id]);
  res.json({ ok: true, id: req.params.id });
});

/* ---------------- 需求 ---------------- */
function demandList({ id, buyerId, catId, status, urgency, regionId, q, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (id) { where.push('d.id = ?'); params.push(id); }
  if (buyerId) { where.push('d.buyer_id = ?'); params.push(buyerId); }
  if (catId) { where.push('d.cat_id = ?'); params.push(catId); }
  if (status) { where.push('d.status = ?'); params.push(status); }
  if (urgency) { where.push('d.urgency = ?'); params.push(urgency); }
  if (regionId) { where.push('b.region_id = ?'); params.push(regionId); }
  if (q) { where.push('(d.id LIKE ? OR d.variety LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = db.all(
    `SELECT d.*, b.name AS buyer_name, b.type AS buyer_type, b.credit AS buyer_credit,
            b.fulfillment AS buyer_fulfillment, b.pay_days, b.region_id AS buyer_region,
            c.name AS cat_name
     FROM demands d JOIN buyers b ON b.id = d.buyer_id JOIN categories c ON c.id = d.cat_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY d.created_at DESC, d.id DESC LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => ({
    id: r.id, buyerId: r.buyer_id, buyerName: r.buyer_name, buyerType: r.buyer_type,
    buyerCredit: r.buyer_credit, buyerFulfillment: r.buyer_fulfillment, payDays: r.pay_days,
    buyerRegion: r.buyer_region,
    catId: r.cat_id, catName: r.cat_name, variety: r.variety, grade: r.grade, qty: r.qty,
    priceLow: r.price_low, priceHigh: r.price_high, fromDate: r.from_date, toDate: r.to_date,
    radius: r.radius, certs: db.json(r.certs, []), minFulfillment: r.min_fulfillment,
    logistics: r.logistics, settlement: r.settlement, sample: !!r.sample,
    urgency: r.urgency, status: r.status, createdAt: r.created_at, lat: r.lat, lng: r.lng,
  }));
}

router.get('/demands', (req, res) => {
  res.json({ items: demandList({ ...req.query, limit: Math.min(200, Number(req.query.limit) || 50) }) });
});

function demandById(id) {
  return demandList({ id, limit: 1 })[0] || null;
}

router.get('/demands/:id', (req, res) => {
  const row = demandById(req.params.id);
  if (!row) return bad(res, '需求不存在', 404);
  res.json(row);
});

router.post('/demands', (req, res) => {
  const b = req.body;
  const errs = [];
  if (!b.buyerId || !db.get('SELECT 1 FROM buyers WHERE id = ?', [b.buyerId])) errs.push('买方不存在');
  if (!b.catId || !db.get('SELECT 1 FROM categories WHERE id = ?', [b.catId])) errs.push('品类不存在');
  if (!(Number(b.qty) > 0)) errs.push('采购量需大于 0');
  if (!b.fromDate || !b.toDate) errs.push('缺少采购时间窗');
  if (errs.length) return bad(res, errs.join('；'));

  const buyer = db.get('SELECT * FROM buyers WHERE id = ?', [b.buyerId]);
  const id = 'D' + String(db.get('SELECT COUNT(*) AS n FROM demands').n + 1).padStart(3, '0');
  db.run(
    `INSERT INTO demands(id,buyer_id,cat_id,variety,grade,qty,price_low,price_high,from_date,to_date,
      radius,certs,min_fulfillment,logistics,settlement,sample,urgency,status,created_at,lat,lng)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, b.buyerId, b.catId, b.variety || '', b.grade || '不限', Number(b.qty),
      Number(b.priceLow) || 0, Number(b.priceHigh) || 0, b.fromDate, b.toDate,
      Number(b.radius) || 100, JSON.stringify(b.certs || []), Number(b.minFulfillment) || 75,
      b.logistics || '均可', b.settlement || '均可', b.sample ? 1 : 0, b.urgency || '普通',
      'open', new Date().toISOString().slice(0, 10), buyer.lat, buyer.lng]
  );
  res.status(201).json(demandById(id));
});

router.patch('/demands/:id', (req, res) => {
  const cur = db.get('SELECT * FROM demands WHERE id = ?', [req.params.id]);
  if (!cur) return bad(res, '需求不存在', 404);
  const b = req.body;
  db.run(
    `UPDATE demands SET variety=?,grade=?,qty=?,price_low=?,price_high=?,from_date=?,to_date=?,
      radius=?,certs=?,min_fulfillment=?,logistics=?,settlement=?,sample=?,urgency=?,status=? WHERE id=?`,
    [b.variety ?? cur.variety, b.grade ?? cur.grade, Number(b.qty ?? cur.qty),
      Number(b.priceLow ?? cur.price_low), Number(b.priceHigh ?? cur.price_high),
      b.fromDate ?? cur.from_date, b.toDate ?? cur.to_date, Number(b.radius ?? cur.radius),
      JSON.stringify(b.certs ?? db.json(cur.certs, [])), Number(b.minFulfillment ?? cur.min_fulfillment),
      b.logistics ?? cur.logistics, b.settlement ?? cur.settlement,
      b.sample === undefined ? cur.sample : (b.sample ? 1 : 0), b.urgency ?? cur.urgency,
      b.status ?? cur.status, req.params.id]
  );
  res.json(demandById(req.params.id));
});

router.delete('/demands/:id', (req, res) => {
  if (!db.get('SELECT 1 FROM demands WHERE id = ?', [req.params.id])) return bad(res, '需求不存在', 404);
  db.run('DELETE FROM demands WHERE id = ?', [req.params.id]);
  res.json({ ok: true, id: req.params.id });
});

/* ---------------- 收藏 ---------------- */
router.get('/favorites', (req, res) => {
  const rows = db.all('SELECT * FROM favorites ORDER BY created_at DESC');
  res.json({
    items: rows.map((r) => {
      let name = r.entity_id;
      if (r.entity_type === 'supplier') {
        const s = db.get('SELECT name FROM suppliers WHERE id = ?', [r.entity_id]);
        if (s) name = s.name;
      } else if (r.entity_type === 'buyer') {
        const b = db.get('SELECT name FROM buyers WHERE id = ?', [r.entity_id]);
        if (b) name = b.name;
      } else if (r.entity_type === 'demand') {
        const d = db.get('SELECT c.name AS cn, dm.qty FROM demands dm JOIN categories c ON c.id = dm.cat_id WHERE dm.id = ?', [r.entity_id]);
        if (d) name = `${d.cn} ${d.qty} 吨`;
      }
      return { id: r.id, entityType: r.entity_type, entityId: r.entity_id, name, createdAt: r.created_at };
    }),
  });
});

router.post('/favorites', (req, res) => {
  const { entityType, entityId } = req.body;
  if (!['supplier', 'buyer', 'demand'].includes(entityType)) return bad(res, '收藏类型非法');
  if (!entityId) return bad(res, '缺少对象 ID');
  const existing = db.get('SELECT id FROM favorites WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
  if (existing) return res.json({ ok: true, id: existing.id, existed: true });
  const r = db.run('INSERT INTO favorites(entity_type,entity_id,created_at) VALUES (?,?,?)',
    [entityType, entityId, new Date().toISOString()]);
  res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
});

router.delete('/favorites/:type/:id', (req, res) => {
  db.run('DELETE FROM favorites WHERE entity_type = ? AND entity_id = ?', [req.params.type, req.params.id]);
  res.json({ ok: true });
});

module.exports = { router, demandList };
