// Copyright (c) 2026 李硕
// SPDX-License-Identifier: MIT
'use strict';
/**
 * smoke-test.js —— 接口级冒烟测试
 * 起独立端口 + 独立数据库（只有基础字典），业务数据全部用接口现造，跑完清理。
 * 运行：npm test
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = 3123;
const TMP_DB = path.join(os.tmpdir(), `agrolane-test-${Date.now()}.db`);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${extra ? ' -> ' + JSON.stringify(extra).slice(0, 300) : ''}`);
  }
}

async function req(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: TMP_DB },
    stdio: 'ignore',
  });

  try {
    if (!await waitForServer()) throw new Error('服务未能在 15s 内启动');

    console.log('\n[1] 空库与基础字典');
    const health = await req('GET', '/api/health');
    check('health 可用', health.status === 200 && health.data.ok);
    check('业务表初始为空', health.data.counts.suppliers === 0 && health.data.counts.buyers === 0,
      health.data.counts);

    const boot = await req('GET', '/api/bootstrap');
    check('基础字典：14 品类 / 17 区域', boot.data.categories.length === 14 && boot.data.regions.length === 17);
    check('无报价时均价为空', boot.data.categories.every((c) => c.originAvg === null && c.quotes === 0));

    const homeEmpty = await req('GET', '/api/home?regionId=R01');
    check('空库工作台不报错且指标为 0', homeEmpty.data.metrics.suppliers === 0 && homeEmpty.data.risks.length === 0);
    check('空库推荐流为空', homeEmpty.data.nearby.items.length === 0);

    console.log('\n[2] 录入台账');
    const s1 = await req('POST', '/api/suppliers', {
      name: '测试甲合作社', regionId: 'R09', level: '合作社', acreage: 60,
      credit: 88, fulfillment: 92, certs: ['绿色食品'], phone: '13800000001',
      cats: [{ catId: 'C02', variety: '纽荷尔', area: 40, supply: 36, gradeA: 85, price: 4.5 }],
    });
    check('新增供方', s1.status === 201 && s1.data.cats[0].months.length > 0, s1.data);

    const s2 = await req('POST', '/api/suppliers', {
      name: '测试乙农场', regionId: 'R04', level: '家庭农场', acreage: 20,
      credit: 76, fulfillment: 84,
      cats: [{ catId: 'C02', area: 15, supply: 12, gradeA: 70, price: 4.9 }],
    });
    check('新增第二个供方', s2.status === 201);

    const s3 = await req('POST', '/api/suppliers', {
      name: '测试丙农场', regionId: 'R10', level: '示范户', acreage: 8,
      credit: 70, fulfillment: 80,
      cats: [{ catId: 'C05', area: 8, supply: 20, gradeA: 75, price: 3.1 }],
    });
    check('新增叶菜供方', s3.status === 201);

    const b1 = await req('POST', '/api/buyers', {
      name: '测试采购商行', type: '水果店', regionId: 'R01', credit: 84, fulfillment: 88,
      payDays: 30, cats: ['C02'],
    });
    check('新增买方', b1.status === 201);

    const d1 = await req('POST', '/api/demands', {
      buyerId: b1.data.id, catId: 'C02', qty: 25, grade: '二级', radius: 200,
      priceLow: 4.4, priceHigh: 4.9, fromDate: '2026-11-25', toDate: '2026-12-20', urgency: '加急',
    });
    check('新增采购单', d1.status === 201 && d1.data.id.startsWith('D'));

    const boot2 = await req('GET', '/api/bootstrap');
    const c02 = boot2.data.categories.find((c) => c.id === 'C02');
    check('均价由报价实时汇总', c02.originAvg === 4.7 && c02.quotes === 2, c02);
    check('可供量汇总正确', c02.supplyTotal === 48, c02.supplyTotal);

    console.log('\n[3] LBS 推荐与 Geo 召回');
    const home = await req('GET', '/api/home?regionId=R01');
    check('工作台统计已更新', home.data.metrics.suppliers === 3 && home.data.metrics.buyers === 1
      && home.data.metrics.openDemands === 1, home.data.metrics);
    check('周边流有数据', home.data.nearby.items.length > 0);

    const feed = await req('GET', '/api/feed?lat=25.386&lng=114.922&radius=150&limit=10&sessionKey=t1');
    check('冷启动标记', feed.data.coldStart === true);
    check('半径内结果不超半径', feed.data.items.every((i) => i.distance <= 150));
    check('同品类最多 2 条', (() => {
      const m = {};
      feed.data.items.forEach((i) => { m[i.catId] = (m[i.catId] || 0) + 1; });
      return Object.values(m).every((n) => n <= 2);
    })());

    await req('POST', '/api/events', { action: 'view', catId: 'C02', sessionKey: 't2' });
    await req('POST', '/api/events', { action: 'favorite', catId: 'C02', sessionKey: 't2' });
    const warm = await req('GET', '/api/feed?lat=25.386&lng=114.922&radius=200&limit=10&sessionKey=t2');
    check('有行为后不再冷启动', warm.data.coldStart === false);
    check('兴趣品类识别正确', warm.data.profile.topCats[0] === 'C02', warm.data.profile);

    const clusters = await req('GET', '/api/clusters?regionId=R01&radius=200&precision=5');
    check('geohash 网格聚合', clusters.data.items.length > 0 && clusters.data.items[0].prefix.length === 5);

    console.log('\n[4] 匹配引擎');
    const match = await req('POST', '/api/match', {
      dir: 'findSupplier', catId: 'C02', qty: 20, grade: '二级', radius: 300,
      originLat: 25.386, originLng: 114.922, originRegion: 'R01',
      from: '2026-11-25', to: '2026-12-20',
    });
    check('匹配有结果', match.data.results.length > 0, match.data.recall);
    const top = match.data.results[0] || {};
    check('结果带五维子分', !!top.subs && typeof top.subs.geo === 'number');
    check('结果带召回通路', Array.isArray(top.channels) && top.channels.length > 0);
    check('结果带理由与风险', typeof top.reason === 'string' && Array.isArray(top.risks));
    check('分数在 0~100', match.data.results.every((r) => r.total >= 0 && r.total <= 100));
    check('召回漏斗统计', match.data.recall.merged >= match.data.recall.afterFilter);

    const demandSide = await req('POST', '/api/match', {
      dir: 'findDemand', catId: 'C02', qty: 10, grade: '不限', radius: 9999,
      originLat: 25.386, originLng: 114.922, originRegion: 'R01',
      from: '2026-11-25', to: '2026-12-20',
    });
    check('反向检索可用', demandSide.data.results.length > 0);

    const emptySide = await req('POST', '/api/match', {
      dir: 'findSupplier', catId: 'C09', qty: 99, grade: '一级', radius: 50,
      originLat: 25.386, originLng: 114.922, originRegion: 'R01',
      from: '2026-11-25', to: '2026-12-20',
    });
    const sug = await req('POST', '/api/match/suggestions', {
      dir: 'findSupplier', catId: 'C09', qty: 99, grade: '一级', radius: 50,
      originLat: 25.386, originLng: 114.922, originRegion: 'R01',
      from: '2026-11-25', to: '2026-12-20',
    });
    check('无结果时给建议', emptySide.data.results.length === 0 && sug.data.items.length > 0);
    check('建议带累计放宽参数', typeof sug.data.items[0].relax === 'object');

    console.log('\n[5] 台账维护');
    const patched = await req('PATCH', `/api/suppliers/${s1.data.id}`, { credit: 95, stalled: true });
    check('更新供方', patched.data.credit === 95 && patched.data.stalled === true);

    const found = await req('GET', `/api/suppliers?q=${encodeURIComponent('测试甲')}`);
    check('检索供方', found.data.items.length === 1);

    const manual = await req('POST', '/api/matches', {
      supplierId: s1.data.id, demandId: d1.data.id, buyerId: b1.data.id,
      catId: 'C02', qty: 20, score: top.total || 80,
    });
    check('手工记撮合', manual.status === 201 && manual.data.ok === true);

    const mlist = await req('GET', '/api/matches?limit=5');
    check('撮合台账可查', mlist.data.items.length >= 1 && !!mlist.data.items[0].entityName);

    const sessions = await req('GET', '/api/sessions');
    check('检索记录落库', sessions.data.items.length >= 3);

    const fav = await req('POST', '/api/favorites', { entityType: 'supplier', entityId: s1.data.id });
    check('收藏', fav.status === 201 || fav.data.existed === true);
    const favs = await req('GET', '/api/favorites');
    check('收藏带名称', favs.data.items.length === 1 && !!favs.data.items[0].name);

    const delD = await req('DELETE', `/api/demands/${d1.data.id}`);
    check('删除采购单', delD.data.ok === true);
    const delS = await req('DELETE', `/api/suppliers/${s2.data.id}`);
    check('删除供方（级联品类）', delS.data.ok === true);
    const after = await req('GET', '/api/bootstrap');
    check('删除后均价重算', after.data.categories.find((c) => c.id === 'C02').quotes === 1);

    const set = await req('PATCH', '/api/settings', { 'weights.geo': 0.3, 'feed.lambda': 80 });
    check('设置写入', set.data.settings['weights.geo'] === 0.3 && set.data.settings['feed.lambda'] === 80);

    console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`);
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    console.error('测试异常：', e.message);
    process.exitCode = 1;
  } finally {
    child.kill();
    for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* 忽略 */ }
    }
  }
})();
