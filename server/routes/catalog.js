// Copyright (c) 2026 李硕
// SPDX-License-Identifier: MIT
'use strict';
/** 基础目录数据：品类 / 区域 / 枚举 / 算法配置 */
const express = require('express');
const db = require('../db');

const router = express.Router();

const ENUMS = {
  grades: ['一级', '二级', '混合', '不限'],
  certs: ['绿色食品', '有机认证', '地理标志', '出口备案'],
  logistics: ['到场自提', '送货到仓', '均可'],
  settlements: ['现款', '账期', '均可'],
  urgency: ['普通', '加急', '滞销助农'],
  buyerTypes: ['水果店', '团餐', '加工厂', '社区团购', '出口商', '商超', '批发市场', '电商平台'],
  levels: ['经营主体', '合作社', '家庭农场', '示范户'],
  radii: [50, 100, 150, 200, 300, 9999],
};

router.get('/bootstrap', (req, res) => {
  // 均价/可供量全部由已录入的报价实时汇总，没有数据就是 null，不做过期推算
  const stats = new Map(db.all(
    `SELECT cat_id, AVG(price) AS avg_price, MIN(price) AS min_price, MAX(price) AS max_price,
            COUNT(*) AS quotes, SUM(supply) AS supply
     FROM supplier_cats GROUP BY cat_id`
  ).map((r) => [r.cat_id, r]));
  const categories = db.all('SELECT * FROM categories ORDER BY id').map((c) => {
    const st = stats.get(c.id);
    return {
      id: c.id, name: c.name, family: c.family, basePrice: c.base_price,
      originAvg: st ? Math.round(st.avg_price * 100) / 100 : null,
      priceRange: st ? [Math.round(st.min_price * 100) / 100, Math.round(st.max_price * 100) / 100] : null,
      quotes: st ? st.quotes : 0,
      supplyTotal: st ? Math.round((st.supply || 0) * 10) / 10 : 0,
      yieldPerMu: c.yield_per_mu,
      months: db.json(c.months, []), varieties: db.json(c.varieties, []), gradeStd: c.grade_std,
      trend: [],
    };
  });
  const regions = db.all('SELECT * FROM regions ORDER BY id');
  const settings = db.getSettings();
  res.json({
    categories,
    regions,
    enums: ENUMS,
    settings,
    stats: {
      suppliers: db.get('SELECT COUNT(*) AS n FROM suppliers').n,
      buyers: db.get('SELECT COUNT(*) AS n FROM buyers').n,
      demands: db.get("SELECT COUNT(*) AS n FROM demands WHERE status = 'open'").n,
      matches: db.get('SELECT COUNT(*) AS n FROM matches').n,
      sessions: db.get('SELECT COUNT(*) AS n FROM search_sessions').n,
    },
    families: [...new Set(categories.map((c) => c.family))],
  });
});

router.patch('/settings', (req, res) => {
  const allowed = Object.keys(db.DEFAULT_SETTINGS);
  const changed = [];
  Object.entries(req.body || {}).forEach(([k, v]) => {
    if (!allowed.includes(k)) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    db.setSetting(k, n);
    changed.push(k);
  });
  res.json({ ok: true, changed, settings: db.getSettings() });
});

module.exports = router;
