'use strict';
/**
 * index.js —— Node.js + SQLite 全栈服务
 *
 * 分层：
 *   routes/insights.js  工作台 / LBS 推荐流 / 行情 / 地理聚合
 *   routes/matching.js  匹配执行与记录
 *   routes/entities.js  主体与需求 CRUD、收藏
 *   routes/catalog.js   品类 / 区域 / 枚举 / 算法配置
 * 核心算法：geo.js（geohash 召回）、match.js（过滤 + 排序）、recommend.js（LBS 推荐）
 */
const path = require('node:path');
const express = require('express');
const db = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// 请求日志（只记耗时与状态，不记明细，避免刷屏）
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`);
    }
  });
  next();
});

app.get('/api/health', (req, res) => {
  const counts = {
    suppliers: db.get('SELECT COUNT(*) AS n FROM suppliers').n,
    buyers: db.get('SELECT COUNT(*) AS n FROM buyers').n,
    demands: db.get('SELECT COUNT(*) AS n FROM demands').n,
    matches: db.get('SELECT COUNT(*) AS n FROM matches').n,
  };
  res.json({ ok: true, db: path.basename(db.DB_FILE), counts, uptime: Math.round(process.uptime()) });
});

app.use('/api', require('./routes/catalog'));
app.use('/api', require('./routes/insights'));
app.use('/api', require('./routes/entities').router);
app.use('/api', require('./routes/matching'));

// 静态前端
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 统一错误出口
app.use((err, req, res, next) => {
  console.error('[api error]', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || '服务端错误' });
});

const refInfo = db.ensureReferenceData();
if (refInfo.seeded) {
  console.log(`[db] reference data: ${refInfo.regions} regions / ${refInfo.categories} categories`);
}
console.log(`[db] file: ${db.DB_FILE}`);

app.listen(PORT, () => {
  console.log(`[server] Agrolane running at http://localhost:${PORT}`);
});

module.exports = app;
