// Copyright (c) 2026 李硕
// SPDX-License-Identifier: MIT
'use strict';
/** 匹配接口：执行匹配 / 放宽建议 / 记录查询 */
const express = require('express');
const db = require('../db');
const { runMatch, suggestions } = require('../match');

const router = express.Router();

router.post('/match', (req, res) => {
  const b = req.body || {};
  if (!b.catId) return res.status(400).json({ error: '缺少品类' });
  if (!db.get('SELECT 1 FROM categories WHERE id = ?', [b.catId])) {
    return res.status(400).json({ error: '品类不存在' });
  }
  if (!(Number(b.qty) > 0)) return res.status(400).json({ error: '数量需大于 0' });
  res.json(runMatch({ ...b, dir: b.dir === 'findDemand' ? 'findDemand' : 'findSupplier' }));
});

router.post('/match/suggestions', (req, res) => {
  const b = req.body || {};
  if (!b.catId || !(Number(b.qty) > 0)) return res.status(400).json({ error: '参数不完整' });
  res.json({ items: suggestions({ ...b, dir: b.dir === 'findDemand' ? 'findDemand' : 'findSupplier' }) });
});

router.post('/matches', (req, res) => {
  const b = req.body || {};
  if (!b.catId) return res.status(400).json({ error: '缺少品类' });
  if (!b.supplierId && !b.demandId && !b.buyerId) {
    return res.status(400).json({ error: '缺少撮合对象' });
  }
  const qty = Number(b.qty) || 0;
  const score = Math.min(100, Math.max(0, Number(b.score) || 0));
  const r = db.run(
    `INSERT INTO matches(demand_id,supplier_id,buyer_id,cat_id,qty,score,subs,channels,state,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [b.demandId || null, b.supplierId || null, b.buyerId || null, b.catId, qty, score,
      JSON.stringify(b.subs || {}), JSON.stringify(['manual']), b.state || 'confirmed',
      new Date().toISOString()]
  );
  res.status(201).json({ ok: true, id: Number(r.lastInsertRowid) });
});

router.get('/matches', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const page = Math.max(1, Number(req.query.page) || 1);
  const offset = (page - 1) * limit;
  const state = req.query.state;
  const where = state ? 'WHERE m.state = ?' : '';
  const filter = state ? [state] : [];
  const rows = db.all(
    `SELECT m.*, c.name AS cat_name,
            s.name AS supplier_name, b.name AS buyer_name
     FROM matches m
     LEFT JOIN categories c ON c.id = m.cat_id
     LEFT JOIN suppliers s ON s.id = m.supplier_id
     LEFT JOIN buyers b ON b.id = m.buyer_id
     ${where}
     ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
    [...filter, limit, offset]
  );
  const total = db.get(`SELECT COUNT(*) AS n FROM matches m ${where}`, filter).n;
  res.json({
    total, page, pageSize: limit,
    items: rows.map((r) => ({
      id: r.id, demandId: r.demand_id, supplierId: r.supplier_id, buyerId: r.buyer_id,
      catId: r.cat_id, catName: r.cat_name, qty: r.qty, score: r.score,
      subs: db.json(r.subs, {}), channels: db.json(r.channels, []),
      state: r.state, createdAt: r.created_at,
      entityName: r.supplier_name || r.buyer_name || '—',
    })),
  });
});

router.get('/matches/:id', (req, res) => {
  const r = db.get(
    `SELECT m.*, c.name AS cat_name, s.name AS supplier_name, b.name AS buyer_name
     FROM matches m LEFT JOIN categories c ON c.id = m.cat_id
     LEFT JOIN suppliers s ON s.id = m.supplier_id
     LEFT JOIN buyers b ON b.id = m.buyer_id WHERE m.id = ?`,
    [req.params.id]
  );
  if (!r) return res.status(404).json({ error: '记录不存在' });
  res.json({
    ...r, subs: db.json(r.subs, {}), channels: db.json(r.channels, []),
  });
});

router.get('/sessions', (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const rows = db.all('SELECT * FROM search_sessions ORDER BY id DESC LIMIT ?', [limit]);
  res.json({
    items: rows.map((r) => ({
      id: r.id, dir: r.dir, catId: r.cat_id, qty: r.qty, grade: r.grade, radius: r.radius,
      criteria: db.json(r.criteria, {}), resultCount: r.result_count,
      topScore: r.top_score, avgScore: r.avg_score,
      originLat: r.origin_lat, originLng: r.origin_lng, createdAt: r.created_at,
    })),
  });
});

module.exports = router;
