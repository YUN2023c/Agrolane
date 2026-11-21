'use strict';
/**
 * match.js —— 供需匹配引擎
 *
 * 三段式（与检索方案一致）：
 *   ① 召回 Recall：Geo 通路 / 内容通路 / 热度通路，多路并行，用 RRF 融合 —— 保证"不漏"，不追求顺序；
 *   ② 过滤 Filter：地理半径、品种、供货月份、产能、等级、履约、信用、认证、场外交易等硬条件；
 *   ③ 排序 Rank：内容向量余弦 + 品质 + 价格适配 + 地域分 加权，叠加滞销助农与回头客修正。
 *
 * 解释性（reason / risks / subs / channels）随结果一起返回，前端不猜分数怎么来的。
 */
const db = require('./db');
const geo = require('./geo');

const VEC_W = [1.25, 1.0, 1.0, 1.0, 0.9, 0.8, 0.55, 0.55, 0.55, 0.8];
const RRF_K = 60;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (n) => Math.round(n);

/* ---------------- 时间/月份工具 ---------------- */
function monthsOf(from, to) {
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return [];
  const out = [];
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth() + 1;
  let guard = 0;
  while ((y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth() + 1)) && guard++ < 24) {
    if (!out.includes(m)) out.push(m);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
const overlaps = (a, b) => a.some((m) => b.includes(m));

/* ---------------- 行映射 ---------------- */
/**
 * supplier_cats JOIN suppliers 的行 → 候选对象（供方 × 单个品类行）。
 * 一个供方有几个品类就是几条候选，key 用 supplier_id + supplier_cats.id 区分。
 */
function mapSupplierRow(row) {
  return {
    type: 'supplier',
    id: row.id,
    scId: row.sc_id,
    name: row.name,
    village: row.village,
    regionId: row.region_id,
    level: row.level,
    acreage: row.acreage,
    coop: row.coop,
    credit: row.credit,
    fulfillment: row.fulfillment,
    privateSales: row.private_sales,
    certs: db.json(row.certs, []),
    stalled: !!row.stalled,
    deals: row.deals,
    phone: row.phone,
    capacityFactor: row.capacity_factor,
    joined: row.joined,
    lat: row.lat,
    lng: row.lng,
    geohash: row.geohash,
    catId: row.cat_id,
    variety: row.variety,
    area: row.area,
    supply: row.supply,
    months: db.json(row.months, []),
    gradeA: row.grade_a,
    price: row.price,
    priceHigh: row.price_high,
  };
}

/* ---------------- 个人兴趣画像 ---------------- */
/**
 * 由 interactions + favorites 构建品类兴趣权重（0~1）。
 * LBS 推荐里这是"兴趣通路"的输入；冷启动时返回空画像，走热度+距离。
 */
function interestProfile(sessionKey, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const score = {};
  const rows = db.all(
    `SELECT cat_id, action, COUNT(*) AS n FROM interactions
     WHERE cat_id IS NOT NULL AND created_at >= ? AND (? IS NULL OR session_key = ?)
     GROUP BY cat_id, action`,
    [since, sessionKey || null, sessionKey || null]
  );
  const actionWeight = { view: 1, favorite: 3, match_run: 2, detail: 1.5, contact: 3 };
  rows.forEach((r) => {
    const w = actionWeight[r.action] || 1;
    score[r.cat_id] = (score[r.cat_id] || 0) + w * r.n;
  });

  const favs = db.all(
    `SELECT f.entity_type, f.entity_id, s.cats AS sc, d.cat_id AS dcat
     FROM favorites f
     LEFT JOIN (SELECT supplier_id, group_concat(cat_id) AS cats FROM supplier_cats GROUP BY supplier_id) s
       ON f.entity_type = 'supplier' AND s.supplier_id = f.entity_id
     LEFT JOIN demands d ON f.entity_type = 'demand' AND d.id = f.entity_id`
  );
  favs.forEach((f) => {
    if (f.dcat) score[f.dcat] = (score[f.dcat] || 0) + 4;
    if (f.sc) f.sc.split(',').forEach((c) => { score[c] = (score[c] || 0) + 2; });
  });

  const max = Math.max(1, ...Object.values(score));
  const out = {};
  Object.entries(score).forEach(([k, v]) => { out[k] = Math.round((v / max) * 100) / 100; });
  return { weights: out, topCats: Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k) };
}

/* ---------------- 召回 ---------------- */
/** 内容通路：品类（+品种）精确匹配，不限地域 */
function contentRecallSuppliers(catId, variety, limit = 300) {
  const rows = db.all(
    `SELECT sc.id AS sc_id, sc.cat_id, sc.variety, sc.area, sc.supply, sc.months,
            sc.grade_a, sc.price, sc.price_high,
            s.id, s.name, s.village, s.region_id, s.level, s.acreage, s.coop, s.credit,
            s.fulfillment, s.private_sales, s.certs, s.stalled, s.deals, s.phone,
            s.capacity_factor, s.joined, s.lat, s.lng, s.geohash
     FROM supplier_cats sc JOIN suppliers s ON s.id = sc.supplier_id
     WHERE sc.cat_id = ? ${variety ? 'AND sc.variety LIKE ?' : ''}
     ORDER BY s.credit DESC LIMIT ?`,
    variety ? [catId, `%${variety}%`, limit] : [catId, limit]
  );
  return rows.map(mapSupplierRow);
}

function geoRecallSuppliers(catId, origin, radiusKm, precisionPrefixes) {
  const range = geo.prefixRangeWhere('s.geohash', precisionPrefixes);
  const rows = db.all(
    `SELECT sc.id AS sc_id, sc.cat_id, sc.variety, sc.area, sc.supply, sc.months,
            sc.grade_a, sc.price, sc.price_high,
            s.id, s.name, s.village, s.region_id, s.level, s.acreage, s.coop, s.credit,
            s.fulfillment, s.private_sales, s.certs, s.stalled, s.deals, s.phone,
            s.capacity_factor, s.joined, s.lat, s.lng, s.geohash
     FROM supplier_cats sc JOIN suppliers s ON s.id = sc.supplier_id
     WHERE sc.cat_id = ? AND ${range.sql}`,
    [catId, ...range.params]
  );
  const out = radiusKm && radiusKm < 9999
    ? rows.filter((r) => geo.haversine(origin, r) <= radiusKm * 1.02)
    : rows;
  return out.map(mapSupplierRow);
}

function hotRecallSuppliers(catId, limit = 60) {
  const rows = db.all(
    `SELECT DISTINCT s.id, s.name, s.village, s.region_id, s.level, s.acreage, s.coop, s.credit,
            s.fulfillment, s.private_sales, s.certs, s.stalled, s.deals, s.phone,
            s.capacity_factor, s.joined, s.lat, s.lng, s.geohash,
            sc.id AS sc_id, sc.cat_id, sc.variety, sc.area, sc.supply, sc.months,
            sc.grade_a, sc.price, sc.price_high
     FROM supplier_cats sc JOIN suppliers s ON s.id = sc.supplier_id
     WHERE sc.cat_id = ?
     ORDER BY s.deals DESC, s.fulfillment DESC LIMIT ?`,
    [catId, limit]
  );
  return rows.map(mapSupplierRow);
}

function geoRecallDemands(catId, origin, radiusKm, prefixes) {
  const range = geo.prefixRangeWhere('b.geohash', prefixes);
  const rows = db.all(
    `SELECT d.*, b.id AS b_id, b.name AS b_name, b.type AS b_type, b.credit AS b_credit,
            b.fulfillment AS b_fulfillment, b.pay_days AS b_pay_days, b.phone AS b_phone,
            b.since AS b_since, b.region_id AS b_region_id, b.lat AS b_lat, b.lng AS b_lng
     FROM demands d JOIN buyers b ON b.id = d.buyer_id
     WHERE d.cat_id = ? AND d.status = 'open' AND ${range.sql}`,
    [catId, ...range.params]
  );
  const out = radiusKm && radiusKm < 9999
    ? rows.filter((r) => geo.haversine(origin, { lat: r.b_lat, lng: r.b_lng }) <= radiusKm * 1.02)
    : rows;
  return out.map(mapDemandRow);
}

function contentRecallDemands(catId, variety, limit = 300) {
  const rows = db.all(
    `SELECT d.*, b.id AS b_id, b.name AS b_name, b.type AS b_type, b.credit AS b_credit,
            b.fulfillment AS b_fulfillment, b.pay_days AS b_pay_days, b.phone AS b_phone,
            b.since AS b_since, b.region_id AS b_region_id, b.lat AS b_lat, b.lng AS b_lng
     FROM demands d JOIN buyers b ON b.id = d.buyer_id
     WHERE d.cat_id = ? AND d.status = 'open' ${variety ? 'AND d.variety LIKE ?' : ''}
     ORDER BY d.qty DESC LIMIT ?`,
    variety ? [catId, `%${variety}%`, limit] : [catId, limit]
  );
  return rows.map(mapDemandRow);
}

function hotRecallDemands(catId, limit = 60) {
  const rows = db.all(
    `SELECT d.*, b.id AS b_id, b.name AS b_name, b.type AS b_type, b.credit AS b_credit,
            b.fulfillment AS b_fulfillment, b.pay_days AS b_pay_days, b.phone AS b_phone,
            b.since AS b_since, b.region_id AS b_region_id, b.lat AS b_lat, b.lng AS b_lng
     FROM demands d JOIN buyers b ON b.id = d.buyer_id
     WHERE d.cat_id = ? AND d.status = 'open'
     ORDER BY b.credit DESC, d.qty DESC LIMIT ?`,
    [catId, limit]
  );
  return rows.map(mapDemandRow);
}

function mapDemandRow(r) {
  return {
    type: 'demand',
    demand: {
      id: r.id, buyerId: r.buyer_id, catId: r.cat_id, variety: r.variety, grade: r.grade,
      qty: r.qty, priceLow: r.price_low, priceHigh: r.price_high,
      fromDate: r.from_date, toDate: r.to_date, radius: r.radius,
      certs: db.json(r.certs, []), minFulfillment: r.min_fulfillment,
      logistics: r.logistics, settlement: r.settlement, sample: !!r.sample,
      urgency: r.urgency, status: r.status, createdAt: r.created_at,
      lat: r.lat, lng: r.lng,
    },
    buyer: {
      id: r.b_id, name: r.b_name, type: r.b_type, regionId: r.b_region_id,
      credit: r.b_credit, fulfillment: r.b_fulfillment, payDays: r.b_pay_days,
      phone: r.b_phone, since: r.b_since, lat: r.b_lat, lng: r.b_lng,
    },
    key: 'demand:' + r.id,
    catId: r.cat_id,
    variety: r.variety,
    months: monthsOf(r.from_date, r.to_date),
    supply: r.qty,
    gradeA: r.grade === '一级' ? 92 : r.grade === '二级' ? 78 : 84,
    price: (r.price_low + r.price_high) / 2,
    credit: r.b_credit,
    fulfillment: r.b_fulfillment,
    privateSales: 0,
    certs: [],
    stalled: false,
    deals: 0,
    regionId: r.b_region_id,
    lat: r.lat, lng: r.lng,
  };
}

/** 多路召回 + RRF 融合 */
function recall(q, origin) {
  const radius = Number(q.radius) || 9999;
  const wide = radius >= 9999;
  const cover = wide ? { precision: null, prefixes: [] } : geo.coverPrefixes(origin.lat, origin.lng, radius);
  const stats = { radius, precision: cover.precision, cells: cover.prefixes.length };

  const pools = {};
  if (q.dir === 'findSupplier') {
    pools.geo = wide ? [] : geoRecallSuppliers(q.catId, origin, radius, cover.prefixes);
    pools.content = contentRecallSuppliers(q.catId, q.variety);
    pools.hot = hotRecallSuppliers(q.catId);
  } else {
    pools.geo = wide ? [] : geoRecallDemands(q.catId, origin, radius, cover.prefixes);
    pools.content = contentRecallDemands(q.catId, q.variety);
    pools.hot = hotRecallDemands(q.catId);
  }
  stats.geo = pools.geo.length;
  stats.content = pools.content.length;
  stats.hot = pools.hot.length;

  const merged = new Map();
  for (const [channel, rows] of Object.entries(pools)) {
    rows.forEach((cand, idx) => {
      const key = q.dir === 'findSupplier' ? `${cand.id}:${cand.sc_id}` : cand.key;
      const dist = round(geo.haversine(origin, cand.type === 'demand'
        ? { lat: cand.buyer.lat, lng: cand.buyer.lng } : cand));
      let entry = merged.get(key);
      if (!entry) {
        entry = { cand: { ...cand, distance: dist }, rrf: 0, channels: [] };
        merged.set(key, entry);
      }
      entry.rrf += 1 / (RRF_K + idx + 1);
      if (!entry.channels.includes(channel)) entry.channels.push(channel);
    });
  }
  const list = [...merged.values()].sort((a, b) => b.rrf - a.rrf);
  stats.merged = list.length;
  return { candidates: list, stats };
}

/* ---------------- 过滤 ---------------- */
function rejectReason(c, q, relax = {}) {
  if (c.catId !== q.catId && !relax.cat) return 'cat';
  if (q.variety && !(c.variety || '').includes(q.variety) && !relax.variety) return 'variety';
  if (q.radius && q.radius < 9999 && c.distance > q.radius && !relax.radius) return 'geo';
  if (q.months && q.months.length && !overlaps(c.months, q.months) && !relax.month) return 'month';

  const t = db.getSettings();
  const need = (Number(q.qty) || 0) * (t['thresholds.capacityFactor'] || 0.8);
  if (c.type === 'demand') {
    if (q.qty < c.supply * 0.3 && !relax.capacity) return 'capacity';
  } else if (c.supply < need && !relax.capacity) return 'capacity';

  if (q.grade === '一级' && c.gradeA < 40 && !relax.grade) return 'grade';
  if (c.fulfillment < (q.minFulfillment || t['thresholds.fulfillment']) && !relax.fulfill) return 'fulfill';
  if (c.credit < (t['thresholds.credit'] || 60) && !relax.credit) return 'credit';
  if (q.certs && q.certs.length && !q.certs.every((x) => c.certs.includes(x)) && !relax.cert) return 'cert';
  if (c.privateSales > (t['thresholds.privateSales'] || 2) && !relax.privateSales) return 'private';
  return null;
}

/* ---------------- 打分 ---------------- */
function candidateVec(c, q) {
  const qty = Number(q.qty) || 1;
  const cap = c.type === 'demand'
    ? clamp(qty / Math.max(0.1, c.supply), 0, 1)
    : clamp(c.supply / Math.max(0.1, qty), 0, 1);
  const varietyHit = q.variety ? ((c.variety || '').includes(q.variety) ? 1 : 0) : 1;
  return [
    c.gradeA / 100,
    cap,
    1,
    clamp((c.fulfillment * 0.6 + c.credit * 0.4) / 100, 0, 1),
    clamp(c.fulfillment / 100, 0, 1),
    clamp(geo.geoScore(c.distance) / 100, 0, 1),
    c.certs.includes('绿色食品') ? 1 : 0,
    c.certs.includes('有机认证') ? 1 : 0,
    c.certs.includes('地理标志') ? 1 : 0,
    varietyHit,
  ];
}
function queryVec(q) {
  return [
    q.grade === '一级' ? 1 : q.grade === '二级' ? 0.78 : 0.86,
    1, 0.9,
    clamp((q.minFulfillment || 75) / 100, 0, 1),
    clamp((q.minFulfillment || 75) / 100, 0, 1),
    1,
    q.certs.includes('绿色食品') ? 1 : 0.35,
    q.certs.includes('有机认证') ? 1 : 0.25,
    q.certs.includes('地理标志') ? 1 : 0.3,
    q.variety ? 1 : 0.9,
  ];
}
/** 加权余弦（先去均值，枚举/布尔维度不至于把相似度整体拉高） */
function cosine(a, b) {
  let ma = 0, mb = 0, sw = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i] * VEC_W[i]; mb += b[i] * VEC_W[i]; sw += VEC_W[i]; }
  ma /= sw; mb /= sw;
  let num = 0, da = 0, dbt = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += VEC_W[i] * x * y; da += VEC_W[i] * x * x; dbt += VEC_W[i] * y * y;
  }
  const r = num / Math.sqrt((da || 1e-9) * (dbt || 1e-9));
  return clamp(round((r + 1) * 50), 0, 100);
}
function priceFit(c, q) {
  const target = (Number(q.priceLow) + Number(q.priceHigh)) / 2 || 0;
  if (!target || !c.price) return 55;
  const dev = Math.abs(c.price - target) / target;
  return clamp(round(100 - dev * 260), 20, 100);
}
function scoreCandidate(c, q, opts = {}) {
  const t = db.getSettings();
  const capRatio = c.type === 'demand'
    ? (Number(q.qty) || 0) / Math.max(0.1, c.supply)
    : c.supply / Math.max(0.1, Number(q.qty) || 1);
  const subs = {
    q: round(c.gradeA),
    cap: clamp(round(capRatio * 100), 10, 100),
    price: priceFit(c, q),
    credit: round(c.fulfillment * 0.6 + c.credit * 0.4),
    geo: geo.geoScore(c.distance),
  };
  const sim = cosine(candidateVec(c, q), queryVec(q));
  let total =
    (t['weights.content'] || 0.4) * sim +
    (t['weights.quality'] || 0.25) * subs.credit +
    (t['weights.price'] || 0.2) * subs.price +
    (t['weights.geo'] || 0.15) * subs.geo;

  if (c.stalled) total += 10;                 // 滞销助农加权
  if (c.deals > 0) total += 5;                // 有成交记录，信任成本低
  if (opts.originRegion && c.regionId === opts.originRegion) total += 3; // 同镇优先
  if (opts.interest && opts.interest[c.catId]) total += 2 * opts.interest[c.catId];

  total = clamp(total, 0, 99.4);
  return { total: Math.round(total * 10) / 10, sim, subs };
}

/* ---------------- 解释文本 ---------------- */
function pricePercentile(catId, price) {
  const list = db.all(
    'SELECT sc.price FROM supplier_cats sc WHERE sc.cat_id = ? ORDER BY sc.price',
    [catId]
  ).map((r) => r.price);
  if (!list.length) return { pct: null, n: 0 };
  const below = list.filter((p) => p < price).length;
  return { pct: Math.round((below / list.length) * 100), n: list.length };
}
function diffText(price, market) {
  if (!market || !market.originAvg) return '';
  const diff = Math.round(((price - market.originAvg) / market.originAvg) * 100);
  if (diff === 0) return '，与报价均值持平';
  return diff < 0 ? `，低于报价均值 ${Math.abs(diff)}%` : `，高于报价均值 ${diff}%`;
}

function makeReason(c, q, market) {
  const cname = market ? market.name : q.catId;
  if (c.type === 'supplier') {
    return `主栽 ${cname}，一级率 ${c.gradeA}%，履约率 ${c.fulfillment}%，`
      + `距检索原点 ${c.distance}km，报价 ${c.price.toFixed(2)} 元/斤`
      + diffText(c.price, market)
      + '。';
  }
  const d = c.demand;
  return `采购 ${cname} ${d.qty} 吨，目标价 ${c.price.toFixed(2)} 元/斤`
    + diffText(c.price, market)
    + `；类型 ${c.buyer.type}，信用 ${c.credit}，距检索原点 ${c.distance}km，账期 ${c.buyer.payDays} 天。`;
}
function makeRisks(c, q) {
  const out = [];
  if (c.type === 'demand') {
    if (c.credit < 75) out.push(`买方信用评分 ${c.credit}，建议分批结算或预付款`);
    if (c.fulfillment < 85) out.push(`买方历史履约率 ${c.fulfillment}%，建议约定违约责任`);
    if (c.buyer.payDays > 30) out.push(`账期 ${c.buyer.payDays} 天，注意现金流占用`);
    if (c.distance > 200) out.push(`运距 ${c.distance}km，需确认到货时效`);
    return out.slice(0, 2);
  }
  if (c.fulfillment < 85) out.push(`近 12 个月履约率 ${c.fulfillment}%，建议分批交付并约定违约条款`);
  if (c.privateSales > 0) out.push(`近 12 个月场外交易 ${c.privateSales} 次，需确认凭证与结算方式`);
  if (c.supply < q.qty) out.push(`单季可供 ${c.supply} 吨，低于需求 ${q.qty} 吨，需组合供货`);
  if (c.distance > 200) out.push(`运距 ${c.distance}km，需确认冷链与到货时效`);
  if (c.gradeA < 60) out.push(`一级果率 ${c.gradeA}%，等级达标存在波动，建议先看样`);
  if (c.deals === 0) out.push('无历史成交记录，建议先小批量试单');
  return out.slice(0, 2);
}

/* ---------------- 组合供货方案 ---------------- */
/**
 * 单一供方不够量时，给出 2~3 家的组合方案。
 * 只取结果前 8 名，且总量要达到需求的 80% 才算有效方案。
 */
function buildPlans(passed, qty) {
  const top = passed.filter((x) => x.type === 'supplier').slice(0, 8);
  if (top.length < 2) return [];
  if (top[0].supply >= qty) return [];
  const fill = (start) => {
    const chosen = [];
    let sum = 0;
    for (let i = start; i < top.length && sum < qty; i++) {
      if (chosen.length >= 3) break;
      chosen.push(top[i]);
      sum += top[i].supply;
    }
    if (chosen.length < 2 || sum < qty * 0.8) return null;
    return {
      list: chosen.map((x) => ({
        supplierId: x.supplierId, name: x.name, supply: x.supply,
        price: x.price, distance: x.distance, total: x.total, gradeA: x.gradeA,
      })),
      sum: Math.round(sum * 10) / 10,
      avg: round(chosen.reduce((a, b) => a + b.total, 0) / chosen.length),
    };
  };
  const a = fill(0);
  const b = fill(1);
  const out = [];
  if (a) out.push({ key: 'A', ...a });
  if (b && (!a || b.list.map((x) => x.supplierId).join() !== a.list.map((x) => x.supplierId).join())) {
    out.push({ key: 'B', ...b });
  }
  return out;
}

/* ---------------- 主入口 ---------------- */
function runMatch(input) {
  const t = db.getSettings();
  const q = {
    dir: input.dir === 'findDemand' ? 'findDemand' : 'findSupplier',
    catId: input.catId,
    variety: input.variety || '',
    grade: input.grade || '不限',
    qty: Number(input.qty) || 10,
    priceLow: input.priceLow,
    priceHigh: input.priceHigh,
    radius: Number(input.radius) || 9999,
    from: input.from || '2026-11-21',
    to: input.to || '2026-12-21',
    certs: Array.isArray(input.certs) ? input.certs : [],
    minFulfillment: Number(input.minFulfillment) || 75,
    logistic: input.logistic || '',
    settlement: input.settlement || '',
  };
  const origin = {
    lat: Number(input.originLat) || 25.386,
    lng: Number(input.originLng) || 114.922,
    regionId: input.originRegion || 'R01',
  };
  q.months = monthsOf(q.from, q.to);
  const relax = input.relax || {};
  const interest = interestProfile(input.sessionKey).weights;

  const { candidates, stats } = recall(q, origin);
  const market = db.get('SELECT * FROM categories WHERE id = ?', [q.catId]);
  market.originAvg = market.origin_avg;

  const passed = [];
  const rejected = { variety: 0, geo: 0, month: 0, capacity: 0, grade: 0, fulfill: 0, credit: 0, cert: 0, private: 0 };
  candidates.forEach((entry) => {
    const why = rejectReason(entry.cand, q, relax);
    if (why) {
      if (why !== 'cat') rejected[why] = (rejected[why] || 0) + 1;
      return;
    }
    entry.cand.channels = entry.channels;
    const sc = scoreCandidate(entry.cand, q, { originRegion: origin.regionId, interest });
    passed.push({
      type: entry.cand.type,
      supplierId: entry.cand.type === 'supplier' ? entry.cand.id : null,
      demandId: entry.cand.type === 'demand' ? entry.cand.demand.id : null,
      buyerId: entry.cand.type === 'demand' ? entry.cand.buyer.id : null,
      name: entry.cand.type === 'supplier' ? entry.cand.name : entry.cand.buyer.name,
      subName: entry.cand.type === 'supplier'
        ? `${entry.cand.level} · ${entry.cand.village}`
        : `${entry.cand.buyer.type} · ${entry.cand.buyer.regionId}`,
      catId: entry.cand.catId,
      variety: entry.cand.variety,
      regionId: entry.cand.regionId,
      distance: entry.cand.distance,
      supply: Math.round(entry.cand.supply * 10) / 10,
      price: entry.cand.price,
      gradeA: entry.cand.gradeA,
      credit: entry.cand.credit,
      fulfillment: entry.cand.fulfillment,
      certs: entry.cand.type === 'supplier' ? entry.cand.certs : [],
      stalled: !!entry.cand.stalled,
      urgency: entry.cand.type === 'demand' ? entry.cand.demand.urgency : '普通',
      months: entry.cand.months,
      total: sc.total,
      sim: sc.sim,
      subs: sc.subs,
      rrf: Math.round(entry.rrf * 1e4) / 1e4,
      channels: entry.channels,
      reason: makeReason(entry.cand, q, market),
      risks: makeRisks(entry.cand, q),
      marketPct: pricePercentile(q.catId, entry.cand.price),
      isNew: entry.cand.type === 'supplier' && entry.cand.deals === 0,
    });
  });

  const sortMode = input.sort || 'score';
  const sorters = {
    score: (a, b) => b.total - a.total,
    distance: (a, b) => a.distance - b.distance,
    price: (a, b) => a.price - b.price,
    credit: (a, b) => b.subs.credit - a.subs.credit,
  };
  passed.sort(sorters[sortMode] || sorters.score);

  const plans = q.dir === 'findSupplier' ? buildPlans(passed, q.qty) : [];

  const result = {
    query: q,
    origin,
    recall: { ...stats, afterFilter: passed.length, rejected },
    results: passed.slice(0, 50),
    plans,
    weights: {
      content: t['weights.content'], quality: t['weights.quality'],
      price: t['weights.price'], geo: t['weights.geo'],
    },
  };

  if (input.log !== false) {
    const avg = passed.length ? passed.reduce((a, b) => a + b.total, 0) / passed.length : 0;
    const sid = db.run(
      `INSERT INTO search_sessions(dir,cat_id,qty,grade,radius,criteria,result_count,top_score,avg_score,origin_lat,origin_lng,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [q.dir, q.catId, q.qty, q.grade, q.radius, JSON.stringify(q), passed.length,
        passed.length ? passed[0].total : 0, Math.round(avg), origin.lat, origin.lng, new Date().toISOString()]
    );
    result.sessionId = Number(sid.lastInsertRowid);
    passed.slice(0, 6).forEach((r) => {
      db.run(
        `INSERT INTO matches(demand_id,supplier_id,buyer_id,cat_id,qty,score,subs,channels,state,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [r.demandId, r.supplierId, r.buyerId, r.catId, q.qty, r.total,
          JSON.stringify(r.subs), JSON.stringify(r.channels), 'pushed', new Date().toISOString()]
      );
    });
    const recent = db.all('SELECT id FROM matches ORDER BY id DESC LIMIT 600');
    if (recent.length === 600) {
      db.run(`DELETE FROM matches WHERE id < ?`, [recent[recent.length - 1].id]);
    }
  }

  return result;
}

/**
 * 空结果时的放宽建议。
 * 逐级累加放宽维度（而不是每次只放开一个），因为实际场景里往往是"月份 + 产能"同时卡住，
 * 单放开一个仍然为 0，给出"放宽产能"这种单条建议会误导用户。
 */
function suggestions(input) {
  const base = runMatch({ ...input, log: false, relax: {} });
  let cur = base.results.length;
  const noun = input.dir === 'findDemand' ? '采购方' : '供方';
  const steps = [
    { act: 'radius', relax: { radius: true }, t: input.radius < 300 ? '扩大地域范围到 300km' : '取消地域限制' },
    { act: 'month', relax: { month: true }, t: '放宽供货月份（接受跨季 / 尾季货）' },
    { act: 'capacity', relax: { capacity: true }, t: '放宽产能门槛 20%（可组合供货）' },
    { act: 'grade', relax: { grade: true }, t: '降低等级要求到二级' },
    { act: 'cert', relax: { cert: true }, t: '取消认证要求' },
    { act: 'fulfill', relax: { fulfill: true }, t: '放宽履约率门槛' },
    { act: 'private', relax: { privateSales: true }, t: '容忍场外交易记录' },
  ];
  const out = [];
  const acc = {};
  for (const s of steps) {
    Object.assign(acc, s.relax);
    const r = runMatch({ ...input, log: false, relax: { ...acc } });
    if (r.results.length > cur) {
      out.push({
        act: s.act, t: s.t,
        s: `${out.length ? '含此前放宽项 · ' : ''}预计可找到 ${r.results.length} 个${noun}`,
        relax: { ...acc },
      });
      cur = r.results.length;
      if (out.length >= 3) break;
    }
  }
  if (!out.length) {
    out.push({
      act: 'reset', t: '放宽全部条件重新检索',
      s: '不限地域与等级、取消认证要求，并放宽产能门槛',
      relax: { radius: true, month: true, capacity: true, grade: true, cert: true, fulfill: true, credit: true, privateSales: true },
    });
  }
  return out;
}

module.exports = { runMatch, suggestions, monthsOf, overlaps, pricePercentile, interestProfile };
