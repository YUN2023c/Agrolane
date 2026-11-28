// Copyright (c) 2026 李硕
// SPDX-License-Identifier: MIT
'use strict';
/**
 * db.js —— SQLite 数据层（Node 内置 node:sqlite，零原生依赖）
 *
 * 表结构说明见 README「数据模型」。
 * 关键点：
 * - suppliers / buyers / demands 都冗余存了 lat/lng + geohash(7)，geohash 建索引供 Geo 召回做前缀区间扫描；
 * - 多值字段（months / certs / varieties / subs）用 JSON 文本存，读的时候统一在 row 映射层解析；
 * - settings 表存算法阈值与权重，让"规则可配置"而不是硬编码。
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { buildReference } = require('./reference');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'agrolane.db');
const LEGACY_DB = path.join(DATA_DIR, 'locus.db');

/** 旧库名平滑迁移：仅默认路径、仅在旧库存在且新库缺失时改名一次 */
function migrateLegacyDb() {
  if (process.env.DB_FILE) return;
  if (fs.existsSync(DB_FILE) || !fs.existsSync(LEGACY_DB)) return;
  fs.renameSync(LEGACY_DB, DB_FILE);
  for (const sfx of ['-wal', '-shm']) {
    if (fs.existsSync(LEGACY_DB + sfx)) fs.renameSync(LEGACY_DB + sfx, DB_FILE + sfx);
  }
  console.log('[db] migrated legacy database: locus.db -> agrolane.db');
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS regions (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,
  parent_id TEXT,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  geohash   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_regions_geo ON regions(geohash);

CREATE TABLE IF NOT EXISTS categories (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  family         TEXT NOT NULL,
  base_price     REAL NOT NULL,
  origin_avg     REAL,
  wholesale_avg  REAL,
  yield_per_mu   REAL NOT NULL,
  months         TEXT NOT NULL,
  varieties      TEXT NOT NULL,
  grade_std      TEXT
);

CREATE TABLE IF NOT EXISTS price_trends (
  cat_id TEXT NOT NULL,
  day    TEXT NOT NULL,
  price  REAL NOT NULL,
  PRIMARY KEY (cat_id, day)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  village         TEXT,
  region_id       TEXT NOT NULL,
  level           TEXT NOT NULL,
  acreage         INTEGER NOT NULL,
  coop            TEXT,
  credit          INTEGER NOT NULL,
  fulfillment     INTEGER NOT NULL,
  private_sales   INTEGER NOT NULL DEFAULT 0,
  certs           TEXT NOT NULL DEFAULT '[]',
  stalled         INTEGER NOT NULL DEFAULT 0,
  deals           INTEGER NOT NULL DEFAULT 0,
  phone           TEXT,
  capacity_factor REAL NOT NULL DEFAULT 0.8,
  joined          TEXT,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  geohash         TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suppliers_geo ON suppliers(geohash);
CREATE INDEX IF NOT EXISTS idx_suppliers_region ON suppliers(region_id);

CREATE TABLE IF NOT EXISTS supplier_cats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  cat_id      TEXT NOT NULL,
  variety     TEXT,
  area        INTEGER NOT NULL,
  supply      REAL NOT NULL,
  months      TEXT NOT NULL,
  grade_a     INTEGER NOT NULL,
  price       REAL NOT NULL,
  price_high  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sc_cat ON supplier_cats(cat_id);
CREATE INDEX IF NOT EXISTS idx_sc_supplier ON supplier_cats(supplier_id);

CREATE TABLE IF NOT EXISTS buyers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  region_id   TEXT NOT NULL,
  credit      INTEGER NOT NULL,
  fulfillment INTEGER NOT NULL,
  pay_days    INTEGER NOT NULL,
  phone       TEXT,
  since       TEXT,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  geohash     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buyers_geo ON buyers(geohash);

CREATE TABLE IF NOT EXISTS buyer_cats (
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  cat_id   TEXT NOT NULL,
  PRIMARY KEY (buyer_id, cat_id)
);

CREATE TABLE IF NOT EXISTS demands (
  id              TEXT PRIMARY KEY,
  buyer_id        TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  cat_id          TEXT NOT NULL,
  variety         TEXT,
  grade           TEXT NOT NULL,
  qty             REAL NOT NULL,
  price_low       REAL NOT NULL,
  price_high      REAL NOT NULL,
  from_date       TEXT NOT NULL,
  to_date         TEXT NOT NULL,
  radius          INTEGER NOT NULL DEFAULT 100,
  certs           TEXT NOT NULL DEFAULT '[]',
  min_fulfillment INTEGER NOT NULL DEFAULT 75,
  logistics       TEXT,
  settlement      TEXT,
  sample          INTEGER NOT NULL DEFAULT 0,
  urgency         TEXT NOT NULL DEFAULT '普通',
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demands_cat ON demands(cat_id);
CREATE INDEX IF NOT EXISTS idx_demands_buyer ON demands(buyer_id);
CREATE INDEX IF NOT EXISTS idx_demands_status ON demands(status);

CREATE TABLE IF NOT EXISTS matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  demand_id   TEXT,
  supplier_id TEXT,
  buyer_id    TEXT,
  cat_id      TEXT NOT NULL,
  qty         REAL,
  score       REAL NOT NULL,
  subs        TEXT NOT NULL DEFAULT '{}',
  channels    TEXT NOT NULL DEFAULT '[]',
  state       TEXT NOT NULL DEFAULT 'pushed',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);

CREATE TABLE IF NOT EXISTS search_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  dir          TEXT NOT NULL,
  cat_id       TEXT,
  qty          REAL,
  grade        TEXT,
  radius       INTEGER,
  criteria     TEXT NOT NULL DEFAULT '{}',
  result_count INTEGER NOT NULL DEFAULT 0,
  top_score    REAL NOT NULL DEFAULT 0,
  avg_score    REAL NOT NULL DEFAULT 0,
  origin_lat   REAL,
  origin_lng   REAL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS interactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  cat_id      TEXT,
  lat         REAL,
  lng         REAL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_key);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DEFAULT_SETTINGS = {
  'thresholds.fulfillment': 75,
  'thresholds.credit': 60,
  'thresholds.privateSales': 2,
  'thresholds.capacityFactor': 0.8,
  // 排序权重（和为 1）
  'weights.content': 0.4,
  'weights.quality': 0.25,
  'weights.price': 0.2,
  'weights.geo': 0.15,
  // LBS 推荐：距离衰减系数（km）与兴趣/热度权重
  'feed.lambda': 60,
  'feed.wInterest': 0.34,
  'feed.wDistance': 0.3,
  'feed.wQuality': 0.2,
  'feed.wFreshness': 0.16,
  'feed.defaultRadius': 100,
};

let db = null;

function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  migrateLegacyDb();
  db = new DatabaseSync(DB_FILE);
  db.exec(SCHEMA);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run(k, String(v));
  }
  return db;
}

/* ---------- 参数与行映射 ---------- */
function normParam(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return v;
}
const normParams = (arr) => (arr || []).map(normParam);

function all(sql, params) {
  return open().prepare(sql).all(...normParams(params));
}
function get(sql, params) {
  const row = open().prepare(sql).get(...normParams(params));
  return row === undefined ? null : row;
}
function run(sql, params) {
  return open().prepare(sql).run(...normParams(params));
}
function tx(fn) {
  const d = open();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
const json = (s, def) => {
  if (s === null || s === undefined || s === '') return def;
  try { return JSON.parse(s); } catch { return def; }
};

/* ---------- 初始化：只灌基础字典 ---------- */
function isEmpty() {
  const row = get('SELECT COUNT(*) AS n FROM regions');
  return !row || row.n === 0;
}

/**
 * 首次启动灌入区域与品类字典；force=true 时清空业务数据并重建字典。
 * 业务数据（供方/买方/需求/成交/检索记录）不预置。
 */
function ensureReferenceData(force = false) {
  open();
  if (force) {
    tx(() => {
      ['interactions', 'favorites', 'search_sessions', 'matches', 'demands', 'buyer_cats',
        'buyers', 'supplier_cats', 'suppliers', 'price_trends', 'categories', 'regions']
        .forEach((t) => run(`DELETE FROM ${t}`));
    });
  } else if (!isEmpty()) {
    return { seeded: false, regions: 0, categories: 0 };
  }

  const data = buildReference();
  tx(() => {
    const insRegion = open().prepare(
      'INSERT INTO regions(id,name,type,parent_id,lat,lng,geohash) VALUES (?,?,?,?,?,?,?)'
    );
    data.regions.forEach((r) => insRegion.run(r.id, r.name, r.type, r.parentId, r.lat, r.lng, r.geohash));

    const insCat = open().prepare(
      `INSERT INTO categories(id,name,family,base_price,origin_avg,wholesale_avg,yield_per_mu,months,varieties,grade_std)
       VALUES (?,?,?,?,NULL,NULL,?,?,?,?)`
    );
    data.categories.forEach((c) => insCat.run(
      c.id, c.name, c.family, c.basePrice,
      c.yieldPerMu, JSON.stringify(c.months), JSON.stringify(c.varieties), c.gradeStd
    ));
  });

  return { seeded: true, regions: data.regions.length, categories: data.categories.length };
}

/* ---------- 设置读写 ---------- */
function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const out = {};
  rows.forEach((r) => {
    const n = Number(r.value);
    out[r.key] = Number.isFinite(n) && r.value.trim() !== '' ? n : r.value;
  });
  return out;
}
function setSetting(key, value) {
  run('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, String(value)]);
}

module.exports = {
  DB_FILE, open, all, get, run, tx, json, ensureReferenceData, getSettings, setSetting, DEFAULT_SETTINGS,
};
