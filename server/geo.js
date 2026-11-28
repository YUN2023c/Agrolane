// Copyright (c) 2026 李硕
// SPDX-License-Identifier: MIT
'use strict';
/**
 * geo.js —— Geo 索引与距离计算
 *
 * 设计依据（检索思路综述）：
 * 1. 周边检索必须拆成"召回 + 精算"两段：
 *    - 召回：用 geohash 前缀（等价于网格单元）把候选集从全量缩到几十/几百条，允许召回多余、不允许漏召；
 *    - 精算：对召回的候选跑 haversine 真实距离，再按业务半径过滤。
 *    直接 `ORDER BY distance(...)` 全表扫描在数据量上来后必然崩（Yelp / System Design Sandbox 的核心论点）。
 * 2. geohash 单元是矩形，用户站在单元边界时最近的 POI 可能在邻格 —— 必须把覆盖 bbox 的所有单元都查一遍，
 *    而不是只查当前所在的 1 个单元。
 * 3. 精度按半径动态选择：单元尺寸 ≈ 目标半径量级，避免 3km 查询扫 156km 大格。
 */

const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';

const LAT_RANGE = [-90, 90];
const LNG_RANGE = [-180, 180];

/** 编码：经度先、纬度后交替二分，每 5 bit 取一位 base32 */
function encode(lat, lng, precision = 7) {
  let latMin = LAT_RANGE[0], latMax = LAT_RANGE[1];
  let lngMin = LNG_RANGE[0], lngMax = LNG_RANGE[1];
  let hash = '';
  let bits = 0;
  let bit = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { bit = (bit << 1) | 1; lngMin = mid; } else { bit = bit << 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { bit = (bit << 1) | 1; latMin = mid; } else { bit = bit << 1; latMax = mid; }
    }
    even = !even;
    bits += 1;
    if (bits === 5) {
      hash += B32[bit];
      bits = 0;
      bit = 0;
    }
  }
  return hash;
}

/** 解码为单元 bbox */
function decode(hash) {
  let latMin = LAT_RANGE[0], latMax = LAT_RANGE[1];
  let lngMin = LNG_RANGE[0], lngMax = LNG_RANGE[1];
  let even = true;
  for (let i = 0; i < hash.length; i++) {
    const idx = B32.indexOf(hash[i]);
    if (idx < 0) continue;
    for (let b = 4; b >= 0; b--) {
      const on = ((idx >> b) & 1) === 1;
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (on) lngMin = mid; else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (on) latMin = mid; else latMax = mid;
      }
      even = !even;
    }
  }
  return {
    latMin, latMax, lngMin, lngMax,
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2,
  };
}

/** 单元尺寸（度）。geohash 的位分配是固定的，可按精度直接算。 */
function cellSize(precision) {
  const bits = precision * 5;
  const lngBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return {
    lat: 180 / Math.pow(2, latBits),
    lng: 360 / Math.pow(2, lngBits),
  };
}

/** 按半径挑精度：让单个单元边长落在半径的同一量级 */
function precisionForRadius(km) {
  if (km <= 1) return 7;
  if (km <= 3) return 6;
  if (km <= 12) return 5;
  if (km <= 60) return 4;
  if (km <= 250) return 3;
  if (km <= 900) return 2;
  return 1;
}

/** 半径 -> 覆盖矩形（lng 方向按纬度做 cos 修正，避免高纬过度扩张） */
function bboxForRadius(lat, lng, km) {
  const latDelta = km / 111.32;
  const cos = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const lngDelta = km / (111.32 * cos);
  return {
    latMin: Math.max(-90, lat - latDelta),
    latMax: Math.min(90, lat + latDelta),
    lngMin: Math.max(-180, lng - lngDelta),
    lngMax: Math.min(180, lng + lngDelta),
  };
}

/**
 * 返回覆盖该矩形所需的所有 geohash 前缀（去重、限上限）。
 * 上限存在的原因：半径极大时退化为不设地理条件，交给后续评分处理，
 * 而不是生成上千个前缀把 SQL 打爆。
 */
function coverPrefixes(lat, lng, km, maxCells = 64) {
  const p = precisionForRadius(km);
  const { lat: h, lng: w } = cellSize(p);
  const box = bboxForRadius(lat, lng, km);
  const out = new Set();

  for (let la = box.latMin; la <= box.latMax + 1e-9; la += h) {
    for (let ln = box.lngMin; ln <= box.lngMax + 1e-9; ln += w) {
      out.add(encode(la, ln, p));
      if (out.size >= maxCells) return { precision: p, prefixes: [...out], truncated: true };
    }
  }
  // 边界那一格可能因浮点步进漏掉，补上四角
  out.add(encode(box.latMin, box.lngMin, p));
  out.add(encode(box.latMax, box.lngMax, p));
  return { precision: p, prefixes: [...out], truncated: out.size >= maxCells };
}

/** Haversine 真实距离（km） */
function haversine(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const t = Math.PI / 180;
  const dLat = (b.lat - a.lat) * t;
  const dLon = (b.lng - a.lng) * t;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 距离 -> 0~100 的地域分 */
function geoScore(km) {
  if (km <= 50) return 100;
  if (km <= 150) return 92;
  if (km <= 350) return 82;
  if (km <= 800) return 66;
  return 48;
}

/** 距离衰减：用于 LBS 推荐排序，λ 越小衰减越快 */
function distanceDecay(km, lambda = 60) {
  return Math.exp(-Math.max(0, km) / lambda);
}

/** 生成 SQL 条件：geohash 列落在任一前缀范围内（区间写法可走索引） */
function prefixRangeWhere(column, prefixes) {
  const clauses = prefixes.map(() => `${column} >= ? AND ${column} <= ?`);
  const params = [];
  for (const p of prefixes) {
    params.push(p, p + '\uffff');
  }
  return { sql: `(${clauses.join(' OR ')})`, params };
}

module.exports = {
  B32, encode, decode, cellSize, precisionForRadius, bboxForRadius,
  coverPrefixes, haversine, geoScore, distanceDecay, prefixRangeWhere,
};
