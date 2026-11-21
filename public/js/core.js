/* =========================================================
   core.js —— 全局状态、接口层、通用组件
   设计：不引框架，保持与原型一致的原生渲染，但所有数据都来自后端 API。
========================================================= */
'use strict';

const API = '/api';

/* ---------------- DOM 工具 ---------------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const el = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (n) => Math.round(n);
const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
const money = (n) => Number(n || 0).toFixed(2);

/* ---------------- 接口层 ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && data.error) || `接口错误 ${res.status}`);
  return data;
}
const qs = (obj) => Object.entries(obj)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/* ---------------- 埋点 ---------------- */
function track(action, extra = {}) {
  api('/events', {
    method: 'POST',
    body: { action, sessionKey: S.sessionKey, lat: S.loc.lat, lng: S.loc.lng, ...extra },
  }).catch(() => {});
}

/* ---------------- 全局状态 ---------------- */
const LS_LOC = 'agrolane.loc.v1';
const LS_LOC_LEGACY = 'locus.loc.v5';
const LS_SESSION = 'agrolane.session.v1';
const LS_SESSION_LEGACY = 'locus.session.v5';

function readJSON(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 忽略隐私模式 */ }
}

const S = {
  boot: null,
  sessionKey: (() => {
    let k = readJSON(LS_SESSION, null) || readJSON(LS_SESSION_LEGACY, null);
    if (!k) {
      k = 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      writeJSON(LS_SESSION, k);
    }
    return k;
  })(),
  loc: readJSON(LS_LOC, null) || readJSON(LS_LOC_LEGACY, { regionId: 'R01', lat: 25.386, lng: 114.922 }),
  page: 'home',
  home: null,
  match: {
    dir: 'findSupplier',
    catId: 'C02',
    qty: 20,
    grade: '二级',
    radius: 200,
    from: '',
    to: '',
    certs: [],
    minFulfillment: 75,
    sort: 'score',
    result: null,
    suggestions: null,
    loading: false,
  },
  entities: { kind: 'supplier', q: '', catId: '', regionId: '', page: 1, data: null, loading: false },
  records: { tab: 'sessions', data: null },
};

const catById = (id) => (S.boot ? S.boot.categories.find((c) => c.id === id) : null);
const regionById = (id) => (S.boot ? S.boot.regions.find((r) => r.id === id) : null);
const catName = (id) => (catById(id) ? catById(id).name : id);
const regionName = (id) => (regionById(id) ? regionById(id).name : id || '—');

/* ---------------- 位置 ---------------- */
function setLoc(loc) {
  S.loc = { ...S.loc, ...loc };
  writeJSON(LS_LOC, S.loc);
}
function nearestRegion(lat, lng) {
  const R = 6371, t = Math.PI / 180;
  let best = null, bestD = Infinity;
  S.boot.regions.forEach((r) => {
    const dLat = (r.lat - lat) * t, dLng = (r.lng - lng) * t;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * t) * Math.cos(r.lat * t) * Math.sin(dLng / 2) ** 2;
    const d = R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    if (d < bestD) { bestD = d; best = r; }
  });
  return { region: best, km: Math.round(bestD) };
}
/**
 * 应用手输的检索原点：只认经纬度，区域名与 geohash 由坐标反查。
 * 非法坐标不写入，保留原值。
 */
function applyOrigin(latRaw, lngRaw, opts) {
  opts = opts || {};
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    toast('纬度需在 -90 ~ 90 之间', 'err');
    return false;
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    toast('经度需在 -180 ~ 180 之间', 'err');
    return false;
  }
  const near = nearestRegion(lat, lng);
  setLoc({
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    regionId: near.region ? near.region.id : null,
  });
  syncOriginUI();
  if (!opts.silent) {
    toast('原点已更新');
    S.home = null;
    S.match.result = null;
    refreshPage();
  }
  return true;
}

function syncOriginUI() {
  const lat = el('origin-lat');
  const lng = el('origin-lng');
  if (lat) lat.value = S.loc.lat.toFixed(4);
  if (lng) lng.value = S.loc.lng.toFixed(4);
  const box = el('side-loc');
  if (box) {
    const near = nearestRegion(S.loc.lat, S.loc.lng);
    box.textContent = near.region ? near.region.name + ' · ' + near.km + ' km' : '辖区外';
  }
}

/* ---------------- 通用组件 ---------------- */
let ringSeq = 0;
function scoreRing(score, size = 62, cap = '匹配度') {
  const v = clamp(Number(score) || 0, 0, 100);
  const color = v >= 85 ? '#276B56' : v >= 70 ? '#4E9C80' : 'rgba(60,60,67,.42)';
  const track = 'rgba(120,120,128,.16)';
  const r = 88, c = 2 * Math.PI * r, dash = c * (1 - v / 100);
  const id = 'sr' + (++ringSeq);
  return `<div class="score-ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 240 240" width="${size}" height="${size}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity=".86"/><stop offset="1" stop-color="${color}"/>
      </linearGradient></defs>
      <circle cx="120" cy="120" r="${r}" fill="none" stroke="${track}" stroke-width="24"/>
      <circle cx="120" cy="120" r="${r}" fill="none" stroke="url(#${id})" stroke-width="24" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${dash.toFixed(1)}"/>
    </svg>
    <div class="in"><div class="n" style="font-size:${Math.round(size * 0.31)}px;color:${color}">${Math.round(v)}</div>
    <div class="u">${cap}</div></div></div>`;
}

function radar5(subs, size = 96, withLabels = false) {
  const W = withLabels ? 150 : 100;
  const cx = W / 2, cy = W / 2, R = W * 0.31;
  const vals = [subs.q, subs.cap, subs.price, subs.credit, subs.geo];
  const labels = ['品质', '产能', '价格', '信用', '地域'];
  const pt = (i, r) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
    return [+(cx + r * Math.cos(a)).toFixed(1), +(cy + r * Math.sin(a)).toFixed(1)];
  };
  let s = `<svg viewBox="0 0 ${W} ${W}" width="${size}" height="${size}" style="display:block">`;
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    s += `<polygon points="${[0, 1, 2, 3, 4].map((i) => pt(i, R * f).join(',')).join(' ')}" fill="none" stroke="rgba(60,60,67,.13)" stroke-width=".8"/>`;
  });
  [0, 1, 2, 3, 4].forEach((i) => {
    const p = pt(i, R);
    s += `<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="rgba(60,60,67,.10)" stroke-width=".8"/>`;
  });
  s += `<polygon points="${vals.map((v, i) => pt(i, R * clamp(v || 0, 0, 100) / 100).join(',')).join(' ')}" fill="rgba(39,107,86,.16)" stroke="#276B56" stroke-width="1.3" stroke-linejoin="round"/>`;
  vals.forEach((v, i) => {
    const p = pt(i, R * clamp(v || 0, 0, 100) / 100);
    s += `<circle cx="${p[0]}" cy="${p[1]}" r="1.9" fill="#276B56"/>`;
  });
  if (withLabels) {
    labels.forEach((l, i) => {
      const p = pt(i, R + 18);
      s += `<text x="${p[0]}" y="${p[1]}" text-anchor="middle" dominant-baseline="middle" font-size="8" fill="rgba(60,60,67,.55)" font-family="-apple-system,PingFang SC,sans-serif">${l}</text>`;
    });
  }
  return s + '</svg>';
}

function segHTML(items, value, attr, cls = '') {
  return `<div class="seg ${cls}">${items.map((it) => {
    const v = typeof it === 'string' ? it : it.v;
    const label = typeof it === 'string' ? it : it.t;
    return `<button type="button" class="${v === value ? 'on' : ''}" data-${attr}="${esc(v)}">${esc(label)}</button>`;
  }).join('')}</div>`;
}

function skCards(n = 3) {
  return Array.from({ length: n }, () => '<div class="sk sk-card"></div>').join('');
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, type) {
  const t = el('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'err' ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2200);
}

/* ---------------- Sheet ---------------- */
function openSheet(html) {
  el('sheetBody').innerHTML = html;
  document.body.classList.add('is-sheet');
  el('sheet').classList.add('open');
  el('sheet').scrollTop = 0;
}
function closeSheet() {
  document.body.classList.remove('is-sheet');
  el('sheet').classList.remove('open');
}
function bindSheetBasics() {
  el('overlay').addEventListener('click', closeSheet);
  const sheet = el('sheet');
  sheet.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-close]');
    if (btn) closeSheet();
  });
  // 下拉手势关闭
  const grip = el('grip');
  let startY = 0, delta = 0, dragging = false;
  const onStart = (e) => {
    dragging = true; startY = (e.touches ? e.touches[0].clientY : e.clientY); delta = 0;
    sheet.classList.add('dragging');
  };
  const onMove = (e) => {
    if (!dragging) return;
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    delta = Math.max(0, y - startY);
    sheet.style.transform = `translateY(${delta}px)`;
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
    if (delta > 96) closeSheet();
  };
  grip.addEventListener('mousedown', onStart);
  grip.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);
}

/* ---------------- 导航 ---------------- */
function goPage(p) {
  S.page = p;
  $$('.page').forEach((s) => s.classList.toggle('active', s.dataset.page === p));
  $$('.nav-item').forEach((t) => t.classList.toggle('on', t.dataset.tab === p));
  refreshPage();
}
function refreshPage() {
  if (!S.boot) return;
  if (S.page === 'home') renderHome();
  if (S.page === 'match') renderMatch();
  if (S.page === 'entities') renderEntities();
  if (S.page === 'records') renderRecords();
}

/* ---------------- 时间 ---------------- */
const pad2 = (n) => String(n).padStart(2, '0');
function isoDay(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function plusDays(days) { const d = new Date(); d.setDate(d.getDate() + days); return isoDay(d); }
function fmtDate(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return iso || '—';
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* ---------------- 小图标 ---------------- */
const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.8 20h18.4z"/><path d="M12 9.6v4.2M12 17.2h.01"/></svg>',
};
