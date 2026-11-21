'use strict';
/**
 * recommend.js —— 基于 LBS 的内容推荐 + 工作台聚合
 *
 * 推荐公式（可解释、可调权重，权重存在 settings 表）：
 *   score = wInterest * 兴趣匹配 + wDistance * 距离衰减 + wQuality * 主体质量 + wFreshness * 新鲜度
 * 兴趣来自 interactions / favorites 的品类画像；冷启动（无画像）时把兴趣权重让给距离与热度，
 * 而不是把所有品类的兴趣分当 0 —— 这是 LBS 推荐里最常见的冷启动坑。
 */
const db = require('./db');
const geo = require('./geo');
const { interestProfile, pricePercentile, monthsOf } = require('./match');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (n) => Math.round(n);

function resolveOrigin({ lat, lng, regionId } = {}) {
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== undefined && lng !== undefined) {
    return { lat: Number(lat), lng: Number(lng), regionId: regionId || null, source: 'gps' };
  }
  if (regionId) {
    const r = db.get('SELECT * FROM regions WHERE id = ?', [regionId]);
    if (r) return { lat: r.lat, lng: r.lng, regionId: r.id, source: 'region' };
  }
  const fallback = db.get("SELECT * FROM regions WHERE id = 'R01'");
  return { lat: fallback.lat, lng: fallback.lng, regionId: fallback.id, source: 'default' };
}

function nearbyDemands(origin, radiusKm) {
  const cover = geo.coverPrefixes(origin.lat, origin.lng, radiusKm);
  const range = geo.prefixRangeWhere('b.geohash', cover.prefixes);
  const rows = db.all(
    `SELECT d.*, b.name AS b_name, b.type AS b_type, b.credit AS b_credit,
            b.fulfillment AS b_fulfillment, b.pay_days, b.lat AS b_lat, b.lng AS b_lng,
            c.name AS cat_name, c.origin_avg
     FROM demands d
     JOIN buyers b ON b.id = d.buyer_id
     JOIN categories c ON c.id = d.cat_id
     WHERE d.status = 'open' AND ${range.sql}`,
    range.params
  );
  return rows
    .map((r) => ({ ...r, distance: geo.haversine(origin, { lat: r.b_lat, lng: r.b_lng }) }))
    .filter((r) => r.distance <= radiusKm)
    .map((r) => ({
      kind: 'demand',
      id: r.id,
      title: `${r.cat_name} ${r.qty} 吨`,
      subtitle: `${r.b_name} · ${r.b_type}`,
      catId: r.cat_id,
      catName: r.cat_name,
      distance: round(r.distance),
      lat: r.b_lat,
      lng: r.b_lng,
      price: (r.price_low + r.price_high) / 2,
      priceLow: r.price_low,
      priceHigh: r.price_high,
      qty: r.qty,
      urgency: r.urgency,
      quality: (r.b_credit * 0.6 + r.b_fulfillment * 0.4) / 100,
      freshness: Math.max(0, 1 - hoursSince(r.created_at) / (24 * 45)),
      payDays: r.pay_days,
      certs: db.json(r.certs, []),
      window: `${r.from_date} ~ ${r.to_date}`,
      regionId: null,
    }));
}

function nearbySuppliers(origin, radiusKm) {
  const cover = geo.coverPrefixes(origin.lat, origin.lng, radiusKm);
  const range = geo.prefixRangeWhere('s.geohash', cover.prefixes);
  const rows = db.all(
    `SELECT s.id, s.name, s.village, s.level, s.credit, s.fulfillment, s.stalled, s.deals,
            s.certs, s.lat, s.lng, s.region_id,
            sc.cat_id, sc.supply, sc.price, sc.grade_a, sc.variety, c.name AS cat_name
     FROM suppliers s
     JOIN supplier_cats sc ON sc.supplier_id = s.id
     JOIN categories c ON c.id = sc.cat_id
     WHERE ${range.sql}`,
    range.params
  );
  return rows
    .map((r) => ({ ...r, distance: geo.haversine(origin, { lat: r.lat, lng: r.lng }) }))
    .filter((r) => r.distance <= radiusKm)
    .map((r) => ({
      kind: 'supplier',
      id: r.id,
      title: `${r.name}`,
      subtitle: `${r.cat_name} · ${r.village}`,
      catId: r.cat_id,
      catName: r.cat_name,
      distance: round(r.distance),
      lat: r.lat,
      lng: r.lng,
      price: r.price,
      qty: r.supply,
      gradeA: r.grade_a,
      urgency: r.stalled ? '滞销助农' : '普通',
      quality: (r.credit * 0.6 + r.fulfillment * 0.4) / 100,
      freshness: r.deals > 0 ? 0.9 : 0.6,
      certs: db.json(r.certs, []),
      regionId: r.region_id,
      stalled: !!r.stalled,
    }));
}

function hoursSince(iso) {
  const t = Date.parse(iso && iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (isNaN(t)) return 24;
  return Math.max(0, (Date.now() - t) / 3600000);
}

/**
 * LBS 内容推荐 feed
 * @returns {{origin, radius, coldStart, profile, items}}
 */
function feed({ lat, lng, regionId, radius, limit = 8, sessionKey, kind = 'all' } = {}) {
  const t = db.getSettings();
  const origin = resolveOrigin({ lat, lng, regionId });
  const r = Number(radius) || t['feed.defaultRadius'] || 100;
  const lambda = t['feed.lambda'] || 60;
  const profile = interestProfile(sessionKey);
  const hasProfile = Object.keys(profile.weights).length > 0;
  const coldStart = !hasProfile;

  // 冷启动：兴趣权重让给距离与热度，避免"全 0 兴趣"把排序压平
  const wInterest = coldStart ? 0 : (t['feed.wInterest'] || 0.34);
  const wDistance = coldStart ? (t['feed.wDistance'] || 0.3) + 0.24 : (t['feed.wDistance'] || 0.3);
  const wQuality = coldStart ? (t['feed.wQuality'] || 0.2) + 0.1 : (t['feed.wQuality'] || 0.2);
  const wFresh = coldStart ? (t['feed.wFreshness'] || 0.16) + 0.08 : (t['feed.wFreshness'] || 0.16);

  const pool = [];
  if (kind !== 'supplier') pool.push(...nearbyDemands(origin, r));
  if (kind !== 'demand') pool.push(...nearbySuppliers(origin, r));

  const scored = pool.map((it) => {
    const interest = profile.weights[it.catId] || 0;
    const dist = geo.distanceDecay(it.distance, lambda);
    let score =
      wInterest * interest * 100 +
      wDistance * dist * 100 +
      wQuality * it.quality * 100 +
      wFresh * it.freshness * 100;
    // 加急 / 滞销：本地即时性信号，少量加权
    if (it.urgency === '加急') score += 4;
    if (it.urgency === '滞销助农') score += 3;

    const bits = [`距您 ${it.distance}km`];
    if (hasProfile && interest > 0.35) bits.push(`命中偏好「${it.catName}」`);
    if (it.stalled) bits.push('滞销待对接');
    if (it.urgency === '加急') bits.push('加急采购');
    if (it.distance <= 30) bits.push('同镇可当日到场');
    return { ...it, score: clamp(round(score * 10) / 10, 0, 100), interest, reason: bits.join(' · ') };
  });

  scored.sort((a, b) => b.score - a.score);

  // 多样性：同品类最多 2 条，避免整屏单一品类
  const perCat = {};
  const items = [];
  for (const it of scored) {
    perCat[it.catId] = (perCat[it.catId] || 0) + 1;
    if (perCat[it.catId] > 2) continue;
    items.push(it);
    if (items.length >= limit) break;
  }

  return {
    origin,
    radius: r,
    coldStart,
    profile: { topCats: profile.topCats, weights: profile.weights },
    weights: { interest: wInterest, distance: wDistance, quality: wQuality, freshness: wFresh },
    poolSize: pool.length,
    items,
  };
}

/* ---------------- 行情 ---------------- */
/** 行情全部来自已录入的报价与在售需求；无数据时返回 null 而不是编造 */
function market(catId) {
  const c = db.get('SELECT * FROM categories WHERE id = ?', [catId]);
  if (!c) return null;
  const trend = db.all('SELECT day, price FROM price_trends WHERE cat_id = ? ORDER BY day', [catId]);
  const supply = db.get(
    `SELECT SUM(sc.supply) AS qty, COUNT(DISTINCT sc.supplier_id) AS n,
            AVG(sc.price) AS avg_price, MIN(sc.price) AS min_price, MAX(sc.price) AS max_price
     FROM supplier_cats sc WHERE sc.cat_id = ?`,
    [catId]
  );
  const demand = db.get(
    "SELECT SUM(qty) AS qty, COUNT(*) AS n FROM demands WHERE cat_id = ? AND status = 'open'",
    [catId]
  );
  const supplyQty = Math.round((supply.qty || 0) * 10) / 10;
  const demandQty = Math.round((demand.qty || 0) * 10) / 10;
  const prices = trend.map((x) => x.price);
  const last = prices[prices.length - 1];
  const prev7 = prices[Math.max(0, prices.length - 8)];
  return {
    id: c.id,
    name: c.name,
    family: c.family,
    basePrice: c.base_price,
    originAvg: supply.avg_price ? Math.round(supply.avg_price * 100) / 100 : null,
    priceRange: supply.avg_price
      ? [Math.round(supply.min_price * 100) / 100, Math.round(supply.max_price * 100) / 100]
      : null,
    yieldPerMu: c.yield_per_mu,
    months: db.json(c.months, []),
    varieties: db.json(c.varieties, []),
    gradeStd: c.grade_std,
    trend,
    change7d: last !== undefined && prev7 ? Math.round(((last - prev7) / prev7) * 1000) / 10 : null,
    supplyQty,
    supplySuppliers: supply.n || 0,
    demandQty,
    demandBuyers: demand.n || 0,
    gapRatio: supplyQty > 0 || demandQty > 0
      ? Math.round(((demandQty - supplyQty) / Math.max(1, demandQty)) * 100) : 0,
    avgQuote: supply.avg_price ? Math.round(supply.avg_price * 100) / 100 : null,
    avgPercentile: supply.avg_price ? pricePercentile(catId, supply.avg_price).pct : null,
  };
}

/* ---------------- 工作台 ---------------- */
function home({ lat, lng, regionId, sessionKey } = {}) {
  const origin = resolveOrigin({ lat, lng, regionId });
  const feedRes = feed({ ...origin, radius: 100, limit: 4, sessionKey });

  const suppliers = db.get('SELECT COUNT(*) AS n FROM suppliers');
  const buyersCount = db.get('SELECT COUNT(*) AS n FROM buyers');
  const openDemands = db.get("SELECT COUNT(*) AS n FROM demands WHERE status = 'open'");
  const stalled = db.get('SELECT COUNT(*) AS n FROM suppliers WHERE stalled = 1');
  const urgent = db.get("SELECT COUNT(*) AS n FROM demands WHERE urgency != '普通' AND status = 'open'");
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const mm = db.get(
    "SELECT COUNT(*) AS n, AVG(score) AS avg FROM matches WHERE created_at >= ? AND state = 'confirmed'",
    [since30]
  );
  const county = db.get(
    `SELECT COUNT(*) AS n FROM suppliers s JOIN regions r ON r.id = s.region_id WHERE r.parent_id = 'R01' OR r.id = 'R01'`
  );

  // 风险：品类缺口 + 滞销 + 低履约
  const gaps = db.all(
    `SELECT c.id, c.name,
            COALESCE((SELECT SUM(sc.supply) FROM supplier_cats sc WHERE sc.cat_id = c.id), 0) AS supply,
            COALESCE((SELECT SUM(d.qty) FROM demands d WHERE d.cat_id = c.id AND d.status = 'open'), 0) AS demand
     FROM categories c`
  ).filter((g) => g.demand > 0)
    .map((g) => ({ ...g, gap: Math.round(((g.demand - g.supply) / Math.max(1, g.demand)) * 100) }))
    .sort((a, b) => b.gap - a.gap);

  const risks = [];
  gaps.slice(0, 2).forEach((g) => {
    if (g.gap > 0) {
      risks.push({
        level: 'high',
        title: `${g.name} 供给缺口 ${g.gap}%`,
        desc: `在售需求 ${Math.round(g.demand)} 吨，可对接供给 ${Math.round(g.supply)} 吨，建议提前调度周边乡镇货源。`,
        meta: `需求 ${Math.round(g.demand)} 吨 / 供给 ${Math.round(g.supply)} 吨`,
      });
    }
  });
  const stalledRows = db.all(
    `SELECT s.name, s.village, sc.cat_id, c.name AS cat_name, sc.supply
     FROM suppliers s JOIN supplier_cats sc ON sc.supplier_id = s.id
     JOIN categories c ON c.id = sc.cat_id
     WHERE s.stalled = 1 ORDER BY sc.supply DESC LIMIT 2`
  );
  stalledRows.forEach((s) => {
    risks.push({
      level: 'mid',
      title: `${s.name} ${s.cat_name} 滞销预警`,
      desc: `${s.village} 可供 ${Math.round(s.supply)} 吨，近 30 天无撮合记录，建议进入助农优先推荐池。`,
      meta: `可供 ${Math.round(s.supply)} 吨`,
    });
  });
  const lowFulfill = db.get('SELECT COUNT(*) AS n FROM suppliers WHERE fulfillment < 80');
  if (lowFulfill.n > 0) {
    risks.push({
      level: 'low',
      title: `低履约主体 ${lowFulfill.n} 家`,
      desc: '履约率低于 80%，撮合时需补充交付凭证。',
      meta: '履约 < 80%',
    });
  }

  const topCats = db.all(
    `SELECT c.id, c.name, c.family, COALESCE(SUM(sc.supply), 0) AS supply
     FROM categories c LEFT JOIN supplier_cats sc ON sc.cat_id = c.id
     GROUP BY c.id ORDER BY supply DESC LIMIT 5`
  );
  const maxSupply = Math.max(1, ...topCats.map((c) => c.supply));

  const families = db.all(
    `SELECT c.family, COALESCE(SUM(sc.supply), 0) AS supply
     FROM categories c LEFT JOIN supplier_cats sc ON sc.cat_id = c.id
     GROUP BY c.family ORDER BY supply DESC`
  );

  return {
    origin,
    greeting: buildGreeting(),
    metrics: {
      suppliers: suppliers.n,
      buyers: buyersCount.n,
      countySuppliers: county.n,
      openDemands: openDemands.n,
      urgentDemands: urgent.n,
      stalled: stalled.n,
      matches30d: mm.n,
      avgMatchScore: mm.avg ? Math.round(mm.avg * 10) / 10 : 0,
    },
    risks: risks.slice(0, 4),
    topCats: topCats.map((c) => ({ ...c, supply: Math.round(c.supply), pct: Math.round((c.supply / maxSupply) * 100) })),
    families: families.map((f) => ({ ...f, supply: Math.round(f.supply) })),
    nearby: feedRes,
  };
}

function buildGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/* ---------------- 地图用聚合（geohash 网格） ---------------- */
/**
 * 按 geohash 前缀把供方聚成网格，给地图/热力用。
 * precision 决定网格粗细（3≈156km / 4≈39km / 5≈4.9km），与查询半径解耦。
 */
function geoClusters({ lat, lng, regionId, radius = 200, precision = 4 } = {}) {
  const origin = resolveOrigin({ lat, lng, regionId });
  const cover = geo.coverPrefixes(origin.lat, origin.lng, radius);
  const p = Math.max(2, Math.min(6, Number(precision) || 4));
  const range = geo.prefixRangeWhere('s.geohash', cover.prefixes);
  const rows = db.all(
    `SELECT substr(s.geohash, 1, ?) AS prefix, AVG(s.lat) AS lat, AVG(s.lng) AS lng,
            COUNT(*) AS n, SUM(s.stalled) AS stalled
     FROM suppliers s WHERE ${range.sql}
     GROUP BY prefix ORDER BY n DESC`,
    [p, ...range.params]
  );
  return rows.map((r) => ({
    prefix: r.prefix, lat: r.lat, lng: r.lng, count: r.n, stalled: r.stalled,
    distance: round(geo.haversine(origin, { lat: r.lat, lng: r.lng })),
  }));
}

module.exports = { feed, home, market, geoClusters, resolveOrigin };
