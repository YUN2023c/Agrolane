'use strict';
/** 重置数据库（删库重建 + 重新灌种子数据）。仅用于本地开发。 */
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const target = process.env.DB_FILE || path.join(dataDir, 'agrolane.db');

for (const f of [target, target + '-wal', target + '-shm']) {
  if (fs.existsSync(f)) {
    fs.renameSync(f, f + '.bak-' + Date.now());
    console.log('[reset] 旧库已改名备份：' + path.basename(f) + '.bak-*');
  }
}

const db = require('../server/db');
const info = db.ensureReferenceData(true);
console.log('[reset] 重建完成（仅基础字典，业务数据为空）：', info);
