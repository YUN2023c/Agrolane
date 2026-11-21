'use strict';
/** 洞察接口：工作台、LBS 推荐流、行情、地理聚合、行为埋点 */
const express = require('express');
const db = require('../db');
const recommend = require('../recommend');

const router = express.Router();

const num = (v) => (v === undefined || v === '' ? undefined : Number(v));

router.get('/home', (req, res) => {
  res.json(recommend.home({
    lat: num(req.query.lat), lng: num(req.query.lng),
    regionId: req.query.regionId, sessionKey: req.query.sessionKey,
  }));
});

router.get('/feed', (req, res) => {
  res.json(recommend.feed({
    lat: num(req.query.lat), lng: num(req.query.lng),
    regionId: req.query.regionId,
    radius: num(req.query.radius),
    limit: Math.min(30, Number(req.query.limit) || 8),
    kind: req.query.kind || 'all',
    sessionKey: req.query.sessionKey,
  }));
});

router.get('/market/:catId', (req, res) => {
  const m = recommend.market(req.params.catId);
  if (!m) return res.status(404).json({ error: '品类不存在' });
  const top = db.all(
    `SELECT s.id, s.name, s.village, s.credit, s.fulfillment, s.stalled, sc.price, sc.supply, sc.grade_a
     FROM supplier_cats sc JOIN suppliers s ON s.id = sc.supplier_id
     WHERE sc.cat_id = ? ORDER BY sc.price ASC LIMIT 5`,
    [req.params.catId]
  );
  const buyers = db.all(
    `SELECT d.id, b.name, b.type, d.qty, d.price_low, d.price_high, d.urgency
     FROM demands d JOIN buyers b ON b.id = d.buyer_id
     WHERE d.cat_id = ? AND d.status = 'open' ORDER BY d.qty DESC LIMIT 5`,
    [req.params.catId]
  );
  res.json({ ...m, topSuppliers: top, topDemands: buyers });
});

router.get('/clusters', (req, res) => {
  res.json({
    items: recommend.geoClusters({
      lat: num(req.query.lat), lng: num(req.query.lng),
      regionId: req.query.regionId,
      radius: num(req.query.radius) || 200,
      precision: num(req.query.precision) || 4,
    }),
  });
});

router.post('/events', (req, res) => {
  const b = req.body || {};
  if (!b.action) return res.status(400).json({ error: '缺少 action' });
  db.run(
    'INSERT INTO interactions(session_key,action,target_type,target_id,cat_id,lat,lng,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [b.sessionKey || null, b.action, b.targetType || null, b.targetId || null,
      b.catId || null, num(b.lat) ?? null, num(b.lng) ?? null, new Date().toISOString()]
  );
  const key = b.sessionKey;
  if (key) {
    const n = db.get('SELECT COUNT(*) AS n FROM interactions WHERE session_key = ?', [key]).n;
    if (n > 500) {
      const keep = db.all('SELECT id FROM interactions WHERE session_key = ? ORDER BY id DESC LIMIT 200', [key]);
      db.run('DELETE FROM interactions WHERE session_key = ? AND id < ?', [key, keep[keep.length - 1].id]);
    }
  }
  res.json({ ok: true });
});

module.exports = router;
