// Copyright (c) 2026 李硕
// SPDX-License-Identifier: MIT
/* =========================================================
   pages.js —— 四个主页面（桌面端）
========================================================= */

/* ---------------- 概览 ---------------- */
function pageHead(title, sub, actions) {
  return `<div class="page-head">
    <div>
      <h1 class="title">${esc(title)}</h1>
      ${sub ? `<div class="head-sub">${esc(sub)}</div>` : ''}
    </div>
    <div class="head-actions">${actions || ''}</div>
  </div>`;
}

function originText() {
  return `${S.loc.lat.toFixed(4)}, ${S.loc.lng.toFixed(4)}`;
}

function feedRow(it) {
  const isBuy = it.kind === 'demand';
  const price = isBuy
    ? `${money(it.priceLow)}–${money(it.priceHigh)}`
    : `${money(it.price)}`;
  return `<div class="feed-row" data-feed-kind="${it.kind}" data-feed-id="${esc(it.id)}" data-feed-cat="${esc(it.catId)}">
    <span class="tag-k ${isBuy ? 'buy' : ''}">${isBuy ? '采购' : '货源'}</span>
    <div class="g">
      <div class="t">${esc(it.title)}</div>
      <div class="s">${esc(it.subtitle)}${it.urgency !== '普通' ? ' · ' + esc(it.urgency) : ''}</div>
    </div>
    <div class="d">${it.distance} km</div>
    <div class="p">${price}<span style="font-size:9.5px;color:var(--ink-3);font-weight:500"> 元/斤</span></div>
  </div>`;
}

async function renderHome() {
  const wrap = el('page-home');
  if (!S.home) {
    wrap.innerHTML = pageHead('概览', originText()) + `<div class="grid-4">${'<div class="sk sk-card"></div>'.repeat(4)}</div>`;
    try {
      S.home = await api('/home?' + qs({
        lat: S.loc.lat, lng: S.loc.lng, regionId: S.loc.regionId,
      }));
    } catch (e) { toast(e.message, 'err'); return; }
    return renderHome();
  }

  const h = S.home;
  const m = h.metrics;
  const empty = m.suppliers === 0 && m.buyers === 0 && m.openDemands === 0;

  const feedList = h.nearby.items.length
    ? h.nearby.items.map(feedRow).join('')
    : `<div class="empty-card" style="padding:28px 8px">半径 ${h.nearby.radius}km 内无在案货源与采购单</div>`;

  const riskList = h.risks.length
    ? h.risks.map((r) => `<div class="risk" style="padding:11px 0">
        <span class="dot ${r.level === 'high' ? 'red' : r.level === 'mid' ? 'orange' : 'yellow'}"></span>
        <div class="grow">
          <div class="t1">${esc(r.title)}</div>
          <div class="t2">${esc(r.desc)}</div>
        </div>
      </div>`).join('')
    : `<div class="empty-card" style="padding:26px 8px">无预警</div>`;

  const catRows = h.topCats.filter((c) => c.supply > 0);
  const catBars = catRows.length
    ? catRows.map((c) => `<div class="chain-bar">
        <span class="nm">${esc(c.name)}</span>
        <span class="bar"><i style="width:${c.pct}%"></i></span>
        <span class="vv">${fmt(c.supply)}t</span>
      </div>`).join('')
    : `<div class="empty-card" style="padding:26px 8px">无报价记录</div>`;

  wrap.innerHTML = pageHead('概览', `${originText()} · 半径 ${h.nearby.radius}km`, `
      <button class="btn btn-quiet btn-sm" data-act="refresh">刷新</button>
      <button class="btn btn-primary btn-sm" data-act="go-match">发起检索</button>
    `) + `
    <div class="grid-4">
      <div class="card metric"><div class="lab">撮合记录</div><div class="val">${fmt(m.matches30d)}<small>笔</small></div><div class="foot">均分 ${m.avgMatchScore || '—'}</div></div>
      <div class="card metric"><div class="lab">在售需求</div><div class="val">${fmt(m.openDemands)}<small>条</small></div><div class="foot">加急 ${m.urgentDemands}</div></div>
      <div class="card metric"><div class="lab">供方台账</div><div class="val">${fmt(m.suppliers)}<small>家</small></div><div class="foot">滞销 ${m.stalled}</div></div>
      <div class="card metric"><div class="lab">买方台账</div><div class="val">${fmt(m.buyers)}<small>家</small></div><div class="foot">—</div></div>
    </div>
    ${empty ? `<div class="card panel" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:16px">
      <div><div style="font-size:13.5px;font-weight:650">台账为空</div>
      <div class="tiny" style="margin-top:4px">先录入供货主体与采购单，检索与撮合才有数据可用</div></div>
      <div class="head-actions">
        <button class="btn btn-quiet btn-sm" data-act="new-supplier">录入供方</button>
        <button class="btn btn-quiet btn-sm" data-act="new-buyer">录入买方</button>
        <button class="btn btn-primary btn-sm" data-act="new-demand">录入采购单</button>
      </div>
    </div>` : ''}

    <div class="cols" style="margin-top:16px">
      <div class="card panel">
        <div class="panel-head"><h2>周边货源与采购单</h2><span>${h.nearby.poolSize} 条</span></div>
        ${feedList}
      </div>
      <div>
        <div class="card panel">
          <div class="panel-head"><h2>预警</h2><span>${h.risks.length}</span></div>
          ${riskList}
        </div>
        <div class="card panel" style="margin-top:16px">
          <div class="panel-head"><h2>品类可供量</h2><span>按报价汇总</span></div>
          ${catBars}
        </div>
      </div>
    </div>

  `;
  bindHomeEvents();
}

function bindHomeEvents() {
  const wrap = el('page-home');
  wrap.querySelectorAll('[data-act="refresh"]').forEach((b) => b.addEventListener('click', () => {
    S.home = null; renderHome();
  }));
  wrap.querySelectorAll('[data-act="go-match"]').forEach((b) => b.addEventListener('click', () => goPage('match')));
  wrap.querySelectorAll('[data-act="new-supplier"]').forEach((b) => b.addEventListener('click', () => openEntityForm('supplier')));
  wrap.querySelectorAll('[data-act="new-buyer"]').forEach((b) => b.addEventListener('click', () => openEntityForm('buyer')));
  wrap.querySelectorAll('[data-act="new-demand"]').forEach((b) => b.addEventListener('click', () => openDemandForm()));
  wrap.querySelectorAll('.feed-row').forEach((row) => row.addEventListener('click', () => {
    const kind = row.dataset.feedKind;
    const id = row.dataset.feedId;
    track('view', { targetType: kind, targetId: id, catId: row.dataset.feedCat });
    if (kind === 'demand') openDemandSheet(id);
    else openEntitySheet('supplier', id);
  }));
}

/* ---------------- 撮合检索 ---------------- */
function matchFormHTML() {
  const st = S.match;
  return `<div class="card form-panel">
    <div class="field">
      <label>检索方向</label>
      ${segHTML([
        { v: 'findSupplier', t: '为采购单找货源' },
        { v: 'findDemand', t: '为货源找采购单' },
      ], st.dir, 'dir', 'compact')}
    </div>
    <div class="field">
      <label>品类</label>
      <select class="sel" data-field="catId">
        ${S.boot.categories.map((c) => `<option value="${c.id}" ${c.id === st.catId ? 'selected' : ''}>${esc(c.name)}（${esc(c.family)}）</option>`).join('')}
      </select>
    </div>
    <div class="field-2">
      <div class="field" style="margin-bottom:0">
        <label>数量 <span class="hint">吨</span></label>
        <input type="number" inputmode="decimal" min="0.5" step="0.5" value="${st.qty}" data-field="qty">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>等级</label>
        <select class="sel" data-field="grade">
          ${S.boot.enums.grades.map((g) => `<option ${g === st.grade ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-2" style="margin-top:12px">
      <div class="field" style="margin-bottom:0">
        <label>半径 <span class="hint">km</span></label>
        <select class="sel" data-field="radius">
          ${S.boot.enums.radii.map((r) => `<option value="${r}" ${Number(st.radius) === r ? 'selected' : ''}>${r >= 9999 ? '不限' : r}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>最低履约 <span class="hint">%</span></label>
        <input type="number" inputmode="numeric" min="0" max="100" step="5" value="${st.minFulfillment}" data-field="minFulfillment">
      </div>
    </div>
    <div class="field-2" style="margin-top:12px">
      <div class="field" style="margin-bottom:0">
        <label>供货起</label>
        <input type="date" value="${st.from}" data-field="from">
      </div>
      <div class="field" style="margin-bottom:0">
        <label>供货止</label>
        <input type="date" value="${st.to}" data-field="to">
      </div>
    </div>
    <div class="field" style="margin-top:12px;margin-bottom:0">
      <label>认证要求</label>
      <div class="chips wrap">${S.boot.enums.certs.map((c) => `
        <button type="button" class="chip ${st.certs.includes(c) ? 'on' : ''}" data-cert="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </div>
    <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="run-match">
      ${st.loading ? '检索中…' : '开始检索'}
    </button>
  </div>`;
}

function subLine(name, val) {
  return `<div class="sub-line"><span class="n">${name}</span><span class="bar"><i style="width:${clamp(val, 0, 100)}%"></i></span><span class="v">${Math.round(val)}</span></div>`;
}

function resultCard(r) {
  const isBuyer = r.type === 'demand';
  const badges = [];
  if (r.stalled) badges.push('<span class="badge-mini stall">滞销</span>');
  if (r.urgency === '加急') badges.push('<span class="badge-mini stall">加急</span>');
  if (r.isNew) badges.push('<span class="badge-mini gray">新入库</span>');

  let priceNote = '';
  if (r.marketPct.pct !== null) {
    priceNote = r.marketPct.pct === 0 ? ' · 本品类最低报价'
      : r.marketPct.pct >= 100 ? ' · 本品类最高报价'
        : ` · 低于 ${r.marketPct.pct}% 同品类报价`;
  }
  const priceLine = `${money(r.price)} 元/斤${priceNote}`;

  return `<div class="card result-card">
    <div class="res-head">
      ${scoreRing(r.total, 58)}
      <div class="res-body">
        <div class="res-name">${esc(r.name)} ${badges.join('')}</div>
        <div class="res-sub">${esc(r.subName)} · ${esc(catName(r.catId))}${r.variety && r.variety !== catName(r.catId) ? ' · ' + esc(r.variety) : ''} · 距原点 ${r.distance}km</div>
      </div>
      <div class="head-actions">
        <button class="btn btn-quiet btn-sm" data-detail="${isBuyer ? 'buyer' : 'supplier'}:${isBuyer ? r.buyerId : r.supplierId}">档案</button>
        <button class="btn btn-ghost btn-sm" data-fav="${isBuyer ? 'buyer' : 'supplier'}:${isBuyer ? r.buyerId : r.supplierId}">收藏</button>
        <button class="btn btn-primary btn-sm" data-relate="1"
          data-supplier="${r.supplierId || ''}" data-demand="${r.demandId || ''}"
          data-buyer="${r.buyerId || ''}" data-cat="${r.catId}" data-score="${r.total}">记撮合</button>
      </div>
    </div>
    <div class="reason">${esc(r.reason)}</div>
    <div class="sub-row">
      <div class="radar-sm">${radar5(r.subs, 108)}</div>
      <div class="subs">
        ${subLine('品质', r.subs.q)}${subLine('产能', r.subs.cap)}${subLine('价格', r.subs.price)}${subLine('信用', r.subs.credit)}${subLine('地域', r.subs.geo)}
      </div>
    </div>
    <div class="market">
      <div class="market-top">
        <div>
          <div class="k">${isBuyer ? '目标价' : '报价'} / 可供量</div>
          <div class="p">${priceLine} <small>· 可供 ${r.supply}t</small></div>
        </div>
        <span class="pill">${isBuyer ? '信用 ' + r.credit : '履约 ' + r.fulfillment + '%'}</span>
      </div>
      ${r.risks.length ? `<div class="risk-line">${ICON.alert}${esc(r.risks.join('；'))}</div>` : ''}
    </div>
  </div>`;
}

function plansHTML(plans) {
  if (!plans || !plans.length) return '';
  return `<div class="card panel">
    <div class="panel-head"><h2>组合供货</h2><span>${plans.length} 套</span></div>
    ${plans.map((p) => `<div class="plan">
      <div class="plan-head"><span class="t">方案 ${p.key}</span><span class="s">${p.list.length} 家 · 合计 ${p.sum}t · 均分 ${p.avg}</span></div>
      ${p.list.map((x) => `<div class="plan-item"><span class="nm">${esc(x.name)}</span><span class="q">${x.supply}t · ${x.distance}km · ${Math.round(x.total)}</span></div>`).join('')}
    </div>`).join('')}
  </div>`;
}

function matchEmptyHTML(sugs, recall) {
  const rej = (recall && recall.rejected) || {};
  const top = Object.entries(rej).sort((a, b) => b[1] - a[1])[0];
  const hints = {
    capacity: '产能不足，可放宽产能阈值或采用组合供货',
    month: '不在供货月份，可放宽时间窗',
    geo: '半径内无候选，可扩大半径',
    cert: '无满足认证要求的主体',
    credit: '信用 / 履约门槛过高',
    fulfill: '履约门槛过高',
    private: '场外交易触发风控',
    variety: '当地无此品种',
  };
  const hint = top && hints[top[0]] ? hints[top[0]] : '无候选';
  return `<div class="card empty-card">${esc(hint)}</div>
    ${(sugs || []).map((s, i) => `<div class="suggest" data-suggest="${i}">
      <div class="g"><div class="t">${esc(s.t)}</div><div class="s">${esc(s.s)}</div></div>
      <span class="go">应用</span>
    </div>`).join('')}`;
}

function renderMatch() {
  const wrap = el('page-match');
  const st = S.match;
  const res = st.result;
  let right = '';

  if (st.loading) {
    right = skCards(2);
  } else if (res) {
    const sorted = [...res.results];
    if (st.sort === 'distance') sorted.sort((a, b) => a.distance - b.distance);
    else if (st.sort === 'price') sorted.sort((a, b) => a.price - b.price);
    else if (st.sort === 'credit') sorted.sort((a, b) => b.subs.credit - a.subs.credit);
    else sorted.sort((a, b) => b.total - a.total);

    right = `<div class="res-head">
      <h2>候选 ${res.recall.afterFilter}</h2>
      <div class="head-actions">
        <span class="meta">半径内 ${res.recall.geo} · 全量 ${res.recall.merged}</span>
        ${segHTML([
          { v: 'score', t: '匹配度' }, { v: 'distance', t: '距离' }, { v: 'price', t: '价格' }, { v: 'credit', t: '信用' },
        ], st.sort, 'sort', 'xs')}
      </div>
    </div>
    ${sorted.length ? sorted.map(resultCard).join('') : matchEmptyHTML(st.suggestions, res.recall)}
    ${plansHTML(res.plans)}`;
  } else {
    right = `<div class="card empty-card" style="padding:72px 18px">尚未检索</div>`;
  }

  wrap.innerHTML = pageHead('撮合检索', `${originText()} · ${regionName(S.loc.regionId)}`, `
      <button class="btn btn-quiet btn-sm" data-act="open-settings">算法参数</button>
    `) + `
    <div class="match-layout">
      ${matchFormHTML()}
      <div>${right}</div>
    </div>`;
  bindMatchEvents();
}

function bindMatchEvents() {
  const wrap = el('page-match');
  const st = S.match;

  wrap.querySelectorAll('[data-act="open-settings"]').forEach((b) => b.addEventListener('click', openSettings));
  wrap.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => {
    st.dir = b.dataset.dir; st.result = null; renderMatch();
  }));
  wrap.querySelectorAll('[data-cert]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.cert;
    st.certs = st.certs.includes(c) ? st.certs.filter((x) => x !== c) : [...st.certs, c];
    renderMatch();
  }));
  wrap.querySelectorAll('[data-field]').forEach((input) => {
    const sync = () => {
      const f = input.dataset.field;
      const v = input.value;
      if (f === 'from' || f === 'to' || f === 'catId' || f === 'grade') st[f] = v;
      else st[f] = Number(v);
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  });
  wrap.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    st.sort = b.dataset.sort; renderMatch();
  }));
  wrap.querySelectorAll('[data-suggest]').forEach((b) => b.addEventListener('click', async () => {
    const s = (st.suggestions || [])[Number(b.dataset.suggest)];
    if (!s) return;
    st.relax = { ...st.relax, ...(s.relax || {}) };
    if (s.act === 'radius') st.radius = st.radius < 300 ? 300 : 9999;
    if (s.act === 'grade') st.grade = '二级';
    if (s.act === 'cert') st.certs = [];
    if (s.act === 'reset') { st.radius = 9999; st.grade = '不限'; st.certs = []; }
    await runMatch();
  }));
  wrap.querySelectorAll('[data-act="run-match"]').forEach((b) => b.addEventListener('click', runMatch));
  wrap.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.detail.split(':');
    openEntitySheet(kind, id);
  }));
  wrap.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', () => {
    const [type, id] = b.dataset.fav.split(':');
    addFavorite(type, id);
  }));
  wrap.querySelectorAll('[data-relate]').forEach((b) => b.addEventListener('click', async () => {
    if (b.disabled) return;
    try {
      await api('/matches', {
        method: 'POST',
        body: {
          supplierId: b.dataset.supplier || null,
          demandId: b.dataset.demand || null,
          buyerId: b.dataset.buyer || null,
          catId: b.dataset.cat,
          qty: st.qty,
          score: Number(b.dataset.score),
        },
      });
      b.disabled = true;
      b.textContent = '已记录';
      toast('已记入撮合台账');
      S.home = null;
    } catch (e) { toast(e.message, 'err'); }
  }));
}

async function runMatch() {
  const st = S.match;
  if (!st.from) st.from = plusDays(0);
  if (!st.to) st.to = plusDays(30);
  st.loading = true;
  st.result = null;
  st.suggestions = null;
  renderMatch();
  try {
    const body = {
      dir: st.dir, catId: st.catId, qty: st.qty, grade: st.grade, radius: st.radius,
      from: st.from, to: st.to, certs: st.certs, minFulfillment: st.minFulfillment,
      originLat: S.loc.lat, originLng: S.loc.lng, originRegion: S.loc.regionId,
      sessionKey: S.sessionKey, relax: { ...st.relax },
    };
    st.result = await api('/match', { method: 'POST', body });
    if (!st.result.results.length) {
      const sug = await api('/match/suggestions', { method: 'POST', body });
      st.suggestions = sug.items;
    }
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    st.loading = false;
    renderMatch();
  }
}

/* ---------------- 主体台账 ---------------- */
function renderEntities() {
  const wrap = el('page-entities');
  const st = S.entities;
  const kindTabs = [
    { v: 'supplier', t: '供方' }, { v: 'buyer', t: '买方' }, { v: 'demand', t: '采购单' },
  ];

  wrap.innerHTML = pageHead('主体台账', '', `
      <button class="btn btn-primary btn-sm" data-act="create">新建</button>
    `) + `
    <div class="head-actions" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">
      ${segHTML(kindTabs, st.kind, 'kind', 'compact')}
      <div class="search" style="margin:0;min-width:220px;flex:0 1 260px">
        ${ICON.search}
        <input placeholder="搜索名称 / 村庄" value="${esc(st.q)}" data-act="search">
        <button class="clear" data-act="clear">${ICON.close}</button>
      </div>
      <select class="sel" style="width:150px" data-act="cat">
        <option value="">全部品类</option>
        ${S.boot.categories.map((c) => `<option value="${c.id}" ${st.catId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div id="entity-list">${skCards(3)}</div>`;

  bindEntityEvents();
  loadEntities();
}

function bindEntityEvents() {
  const wrap = el('page-entities');
  const st = S.entities;
  wrap.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    st.kind = b.dataset.kind; st.page = 1; st.data = null; renderEntities();
  }));
  const catSel = wrap.querySelector('[data-act="cat"]');
  if (catSel) catSel.addEventListener('change', (e) => {
    st.catId = e.target.value; st.page = 1; loadEntities();
  });
  const input = wrap.querySelector('[data-act="search"]');
  const box = input.parentElement;
  if (st.q) box.classList.add('has-value');
  let timer = null;
  input.addEventListener('input', () => {
    st.q = input.value;
    box.classList.toggle('has-value', !!input.value);
    clearTimeout(timer);
    timer = setTimeout(() => { st.page = 1; loadEntities(); }, 240);
  });
  wrap.querySelector('[data-act="clear"]').addEventListener('click', () => {
    st.q = ''; input.value = ''; box.classList.remove('has-value'); loadEntities();
  });
  wrap.querySelector('[data-act="create"]').addEventListener('click', () => {
    if (st.kind === 'demand') openDemandForm();
    else openEntityForm(st.kind === 'buyer' ? 'buyer' : 'supplier');
  });
}

async function loadEntities() {
  const st = S.entities;
  const list = el('entity-list');
  if (!list) return;
  st.loading = true;
  list.innerHTML = skCards(3);
  try {
    if (st.kind === 'supplier') {
      const d = await api('/suppliers?' + qs({ q: st.q, catId: st.catId, page: st.page, pageSize: 40 }));
      st.data = d;
      list.innerHTML = d.items.length
        ? `<div class="ltable">
            <div class="ltable-head cols-e"><span>主体</span><span>区域</span><span>品类</span><span>可供</span><span>信用</span><span>状态</span></div>
            ${d.items.map(supplierRow).join('')}
          </div>
          <div class="tiny" style="text-align:right;margin-top:8px">${d.total} 家</div>`
        : `<div class="card empty-card"><div>无供方记录</div><button class="btn btn-primary btn-sm" style="margin-top:12px" data-act="create">新建供方</button></div>`;
    } else if (st.kind === 'buyer') {
      const d = await api('/buyers?' + qs({ q: st.q, page: st.page, pageSize: 40 }));
      st.data = d;
      list.innerHTML = d.items.length
        ? `<div class="ltable">
            <div class="ltable-head cols-e"><span>买方</span><span>类型</span><span>区域</span><span>在采品类</span><span>信用</span><span>账期</span></div>
            ${d.items.map(buyerRow).join('')}
          </div>
          <div class="tiny" style="text-align:right;margin-top:8px">${d.total} 家</div>`
        : `<div class="card empty-card"><div>无买方记录</div><button class="btn btn-primary btn-sm" style="margin-top:12px" data-act="create">新建买方</button></div>`;
    } else {
      const d = await api('/demands?' + qs({ q: st.q, catId: st.catId, limit: 80 }));
      st.data = d;
      list.innerHTML = d.items.length
        ? `<div class="ltable">
            <div class="ltable-head cols-e"><span>采购单</span><span>买方</span><span>品类 / 等级</span><span>数量 / 价格</span><span>时间窗</span><span>状态</span></div>
            ${d.items.map(demandRow).join('')}
          </div>`
        : `<div class="card empty-card"><div>无采购单</div><button class="btn btn-primary btn-sm" style="margin-top:12px" data-act="create">新建采购单</button></div>`;
    }
    bindRows();
  } catch (e) {
    list.innerHTML = `<div class="card empty-card">${esc(e.message)}</div>`;
  } finally {
    st.loading = false;
  }
}

function supplierRow(s) {
  return `<div class="lrow cols-e" data-row="supplier:${s.id}">
    <span class="n">${esc(s.name)}</span>
    <span class="m">${esc(s.regionName || s.regionId)}</span>
    <span class="m">${esc(s.catNames.join(' / ') || '—')}</span>
    <span class="num">${s.supplyTotal ? s.supplyTotal + ' t' : '—'}</span>
    <span class="num">${s.credit}</span>
    <span class="m">${s.stalled ? '<span class="pill warn">滞销</span>' : (s.fulfillment + '%')}</span>
  </div>`;
}
function buyerRow(b) {
  return `<div class="lrow cols-e" data-row="buyer:${b.id}">
    <span class="n">${esc(b.name)}</span>
    <span class="m">${esc(b.type)}</span>
    <span class="m">${esc(b.regionName || b.regionId)}</span>
    <span class="m">${(b.cats || []).map(catName).join(' / ') || '—'}</span>
    <span class="num">${b.credit}</span>
    <span class="m">${b.payDays} 天</span>
  </div>`;
}
function demandRow(d) {
  return `<div class="lrow cols-e" data-row="demand:${d.id}">
    <span class="n">${d.id} · ${d.qty}t</span>
    <span class="m">${esc(d.buyerName)}</span>
    <span class="m">${esc(d.catName)} · ${esc(d.grade)}</span>
    <span class="num">${money(d.priceLow)}–${money(d.priceHigh)}</span>
    <span class="m">${d.fromDate.slice(5)} ~ ${d.toDate.slice(5)}</span>
    <span class="m">${d.urgency !== '普通' ? `<span class="pill warn">${esc(d.urgency)}</span>` : '在售'}</span>
  </div>`;
}

function bindRows() {
  const list = el('entity-list');
  if (!list) return;
  const st = S.entities;
  list.querySelectorAll('[data-act="create"]').forEach((b) => b.addEventListener('click', () => {
    if (st.kind === 'demand') openDemandForm();
    else openEntityForm(st.kind === 'buyer' ? 'buyer' : 'supplier');
  }));
  list.querySelectorAll('[data-row]').forEach((row) => {
    row.addEventListener('click', () => {
      const [kind, id] = row.dataset.row.split(':');
      if (kind === 'demand') openDemandSheet(id);
      else openEntitySheet(kind, id);
    });
  });
}

/* ---------------- 检索记录 ---------------- */
async function renderRecords() {
  const wrap = el('page-records');
  const st = S.records;
  wrap.innerHTML = pageHead('检索记录', '', `<button class="btn btn-quiet btn-sm" data-act="refresh">刷新</button>`) + `
    <div class="head-actions" style="margin-bottom:14px">
      ${segHTML([{ v: 'sessions', t: '检索' }, { v: 'matches', t: '撮合' }], st.tab, 'rtab', 'compact')}
    </div>
    <div id="records-body">${skCards(2)}</div>`;

  wrap.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () => {
    st.tab = b.dataset.rtab; renderRecords();
  }));
  wrap.querySelector('[data-act="refresh"]').addEventListener('click', () => renderRecords());

  const body = el('records-body');
  try {
    if (st.tab === 'sessions') {
      const d = await api('/sessions?limit=50');
      body.innerHTML = d.items.length
        ? `<div class="ltable">
            <div class="ltable-head cols-r"><span>时间</span><span>方向</span><span>品类 / 条件</span><span>结果</span><span>最高分</span></div>
            ${d.items.map((s) => `<div class="lrow cols-r">
              <span class="m">${fmtDate(s.createdAt)}</span>
              <span class="m">${s.dir === 'findSupplier' ? '找货源' : '找采购单'}</span>
              <span class="m">${esc(catName(s.catId))} · ${s.qty}t · ${s.radius >= 9999 ? '不限' : s.radius + 'km'}</span>
              <span class="num">${s.resultCount}</span>
              <span class="num">${s.resultCount ? Math.round(s.topScore) : '—'}</span>
            </div>`).join('')}
          </div>`
        : `<div class="card empty-card">无检索记录</div>`;
    } else {
      const d = await api('/matches?limit=60&state=confirmed');
      body.innerHTML = d.items.length
        ? `<div class="ltable">
            <div class="ltable-head cols-r"><span>时间</span><span>品类</span><span>撮合对象</span><span>数量</span><span>评分</span></div>
            ${d.items.map((m) => `<div class="lrow cols-r">
              <span class="m">${fmtDate(m.createdAt)}</span>
              <span class="m">${esc(m.catName)}</span>
              <span class="n">${esc(m.entityName)}</span>
              <span class="num">${m.qty}t</span>
              <span class="num">${Math.round(m.score)}</span>
            </div>`).join('')}
          </div>`
        : `<div class="card empty-card">无撮合记录</div>`;
    }
  } catch (e) {
    body.innerHTML = `<div class="card empty-card">${esc(e.message)}</div>`;
  }
}
