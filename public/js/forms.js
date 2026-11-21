/* =========================================================
   forms.js —— 抽屉：主体详情 / 需求详情 / 编辑表单 / 推荐详情 / 设置
========================================================= */

const closeBtn = `<button class="sheet-close" data-close aria-label="关闭">${ICON.close}</button>`;

/* ---------------- 收藏 ---------------- */
async function addFavorite(entityType, entityId) {
  try {
    const r = await api('/favorites', { method: 'POST', body: { entityType, entityId } });
    toast(r.existed ? '已在收藏中' : '已收藏');
    track('favorite', { targetType: entityType, targetId: entityId });
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- 供方 / 买方详情 ---------------- */
async function openEntitySheet(kind, id) {
  openSheet(`<div class="sheet-head"><div><h3>载入中…</h3></div>${closeBtn}</div>`);
  try {
    const d = await api(`/${kind === 'buyer' ? 'buyers' : 'suppliers'}/${id}`);
    openSheet(kind === 'buyer' ? buyerSheetHTML(d) : supplierSheetHTML(d));
    bindEntitySheet(kind, d);
  } catch (e) {
    openSheet(`<div class="sheet-head"><div><h3>读取失败</h3><div class="sub">${esc(e.message)}</div></div>${closeBtn}</div>`);
  }
}

function supplierSheetHTML(s) {
  return `<div class="sheet-head">
    <div>
      <h3>${esc(s.name)}</h3>
      <div class="sub">${esc(s.level)} · ${esc(s.village)} · 加入 ${esc(s.joined || '—')}</div>
    </div>${closeBtn}
  </div>
  <div class="kv-grid">
    ${kvBox('信用评分', s.credit, '')}
    ${kvBox('履约率', s.fulfillment, '%')}
    ${kvBox('认证', s.certs.length ? s.certs.length + ' 项' : '无', '')}
    ${kvBox('geohash', s.geohash.slice(0, 6), '')}
  </div>
  <div class="sec-title"><h2>经营品类</h2><span>${s.cats.length} 个</span></div>
  ${s.cats.map((c) => `<div class="card pad" style="margin-bottom:8px">
    <div class="between"><div style="font-size:13.5px;font-weight:650">${esc(c.catName)}</div>
      <span class="pill brand">${money(c.price)} 元/斤</span></div>
    <div class="stat-mini">
      <div class="m"><div class="l">面积</div><div class="v">${c.area}<small> 亩</small></div></div>
      <div class="m"><div class="l">可供</div><div class="v">${c.supply}<small> 吨</small></div></div>
      <div class="m"><div class="l">一级率</div><div class="v">${c.gradeA}<small> %</small></div></div>
    </div>
    <div class="tag-wrap" style="margin-top:8px">
      ${c.variety ? `<span class="tag neutral">${esc(c.variety)}</span>` : ''}
      <span class="tag neutral">${c.months.length >= 12 ? '全年可供' : c.months.join('、') + ' 月'}</span>
    </div>
  </div>`).join('')}
  <div class="divider"></div>
  <div class="kv"><span class="k">手机</span><span class="v mono">${esc(s.phone || '—')}</span></div>
  <div class="kv"><span class="k">场外交易（近 12 月）</span><span class="v">${s.privateSales} 次</span></div>
  <div class="kv"><span class="k">历史成交</span><span class="v">${s.deals} 单</span></div>
  <div class="kv"><span class="k">产能系数</span><span class="v">${s.capacityFactor}</span></div>
  <div class="sheet-acts">
    <button class="btn btn-ghost" data-sheet-act="fav">收藏</button>
    <button class="btn btn-quiet" data-sheet-act="edit">编辑</button>
    <button class="btn btn-danger" data-sheet-act="del">删除</button>
  </div>`;
}

function buyerSheetHTML(b) {
  return `<div class="sheet-head">
    <div>
      <h3>${esc(b.name)}</h3>
      <div class="sub">${esc(b.type)} · ${esc(b.regionName || b.regionId)} · 合作 ${esc(b.since || '—')}</div>
    </div>${closeBtn}
  </div>
  <div class="kv-grid">
    ${kvBox('信用评分', b.credit, '')}
    ${kvBox('履约率', b.fulfillment, '%')}
    ${kvBox('账期', b.payDays, ' 天')}
    ${kvBox('在售需求', b.demandCount, ' 条')}
  </div>
  <div class="sec-title"><h2>在采品类</h2><span>合计 ${b.demandQty}t</span></div>
  <div class="tag-wrap">${b.cats.map((c) => `<span class="tag">${esc(catName(c))}</span>`).join('') || '<span class="tiny">未维护</span>'}</div>
  <div class="sec-title"><h2>需求明细</h2><span>${b.demands.length} 条</span></div>
  ${b.demands.map((d) => `<div class="card doc-card">
    <div class="between"><span class="doc-id">${d.id}</span><span class="status ${d.status === 'open' ? 'brand' : ''}">${d.status === 'open' ? '在售' : d.status}</span></div>
    <div class="doc-title">${esc(d.catName)} ${d.qty}t · ${esc(d.grade)}</div>
    <div class="doc-meta">
      <div class="m"><div class="lab">价格区间</div><div class="val">${money(d.priceLow)}–${money(d.priceHigh)}</div></div>
      <div class="m"><div class="lab">时间窗</div><div class="val">${d.fromDate.slice(5)} ~ ${d.toDate.slice(5)}</div></div>
      <div class="m"><div class="lab">半径</div><div class="val">${d.radius >= 9999 ? '不限' : d.radius + 'km'}</div></div>
    </div>
  </div>`).join('') || '<div class="card empty-card">暂无需求</div>'}
  <div class="divider"></div>
  <div class="kv"><span class="k">电话</span><span class="v mono">${esc(b.phone || '—')}</span></div>
  <div class="sheet-acts">
    <button class="btn btn-ghost" data-sheet-act="fav">收藏</button>
    <button class="btn btn-quiet" data-sheet-act="newdemand">新增需求</button>
    <button class="btn btn-quiet" data-sheet-act="edit">编辑</button>
  </div>`;
}

function kvBox(k, v, unit) {
  return `<div class="kv-box"><div class="k">${esc(k)}</div><div class="v">${esc(v)}<small>${esc(unit)}</small></div></div>`;
}

function bindEntitySheet(kind, d) {
  const acts = el('sheetBody');
  acts.querySelectorAll('[data-sheet-act]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.sheetAct;
    if (act === 'fav') await addFavorite(kind, d.id);
    if (act === 'edit') openEntityForm(kind, d);
    if (act === 'newdemand') openDemandForm(null, d);
    if (act === 'del') await deleteEntity(kind, d);
  }));
}

async function deleteEntity(kind, d) {
  if (!confirm(`删除「${d.name}」及其品类、采购单？不可恢复。`)) return;
  try {
    await api(`/${kind === 'buyer' ? 'buyers' : 'suppliers'}/${d.id}`, { method: 'DELETE' });
    toast('已删除');
    closeSheet();
    if (S.page === 'entities') loadEntities();
    if (S.page === 'home') { S.home = null; renderHome(); }
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- 需求详情 ---------------- */
async function openDemandSheet(id) {
  openSheet(`<div class="sheet-head"><div><h3>载入中…</h3></div>${closeBtn}</div>`);
  try {
    const d = await api('/demands/' + id);
    openSheet(`<div class="sheet-head">
      <div><h3>${esc(d.catName)} ${d.qty}t</h3>
        <div class="sub">${esc(d.buyerName)} · ${esc(d.buyerType)} · ${d.id}</div></div>${closeBtn}
    </div>
    <div class="kv-grid">
      ${kvBox('目标价', money(d.priceLow) + '–' + money(d.priceHigh), ' 元/斤')}
      ${kvBox('等级', d.grade, '')}
      ${kvBox('半径', d.radius >= 9999 ? '不限' : d.radius + 'km', '')}
      ${kvBox('最低履约', d.minFulfillment, '%')}
    </div>
    <div class="kv"><span class="k">时间窗</span><span class="v">${d.fromDate} ~ ${d.toDate}</span></div>
    <div class="kv"><span class="k">物流</span><span class="v">${esc(d.logistics || '均可')}</span></div>
    <div class="kv"><span class="k">结算</span><span class="v">${esc(d.settlement || '均可')}</span></div>
    <div class="kv"><span class="k">认证要求</span><span class="v">${d.certs.length ? d.certs.join('、') : '无'}</span></div>
    <div class="kv"><span class="k">看样</span><span class="v">${d.sample ? '需要' : '不需要'}</span></div>
    <div class="kv"><span class="k">紧急度</span><span class="v">${esc(d.urgency)}</span></div>
    <div class="kv"><span class="k">坐标</span><span class="v mono">${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}</span></div>
    <div class="sheet-acts">
      <button class="btn btn-ghost" data-sheet-act="fav">收藏</button>
      <button class="btn btn-quiet" data-sheet-act="edit">编辑</button>
      <button class="btn btn-primary" data-sheet-act="match">用此单检索货源</button>
    </div>`);
    el('sheetBody').querySelectorAll('[data-sheet-act]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.sheetAct === 'fav') await addFavorite('demand', d.id);
      if (b.dataset.sheetAct === 'edit') openDemandForm(d);
      if (b.dataset.sheetAct === 'match') {
        Object.assign(S.match, {
          dir: 'findSupplier', catId: d.catId, qty: d.qty, grade: d.grade,
          radius: d.radius, from: d.fromDate, to: d.toDate, certs: d.certs,
          minFulfillment: d.minFulfillment, result: null,
        });
        applyOrigin(d.lat, d.lng, { silent: true });
        closeSheet();
        goPage('match');
        setTimeout(runMatch, 60);
      }
    }));
  } catch (e) {
    openSheet(`<div class="sheet-head"><div><h3>读取失败</h3><div class="sub">${esc(e.message)}</div></div>${closeBtn}</div>`);
  }
}

/* ---------------- 主体编辑表单 ---------------- */
function entityCatRowHTML(row, idx) {
  const r = row || { catId: '', variety: '', area: 10, supply: 8, months: [], gradeA: 75, price: 4, priceHigh: 4.3 };
  return `<div class="cat-row" data-crow="${idx}">
    <div class="field">
      <label>品类 <button type="button" class="mini-del" data-del-row="${idx}">移除</button></label>
      <select class="sel" data-cf="catId">
        <option value="">选择品类</option>
        ${S.boot.categories.map((c) => `<option value="${c.id}" ${c.id === r.catId ? 'selected' : ''}>${esc(c.name)}（${esc(c.family)}）</option>`).join('')}
      </select>
    </div>
    <div class="field-2">
      <div class="field"><label>品种</label><input class="inp" data-cf="variety" value="${esc(r.variety || '')}" placeholder="可留空"></div>
      <div class="field"><label>可供月份</label><input class="inp" data-cf="months" value="${(r.months || []).join(',')}" placeholder="如 11,12,1"></div>
    </div>
    <div class="field-3">
      <div class="field"><label>亩数</label><input class="inp" type="number" min="1" data-cf="area" value="${r.area}"></div>
      <div class="field"><label>可供(吨)</label><input class="inp" type="number" min="0.1" step="0.1" data-cf="supply" value="${r.supply}"></div>
      <div class="field"><label>一级率 %</label><input class="inp" type="number" min="0" max="100" data-cf="gradeA" value="${r.gradeA}"></div>
    </div>
    <div class="field" style="margin-bottom:0">
      <label>报价(元/斤)</label>
      <input class="inp" type="number" min="0" step="0.01" data-cf="price" value="${r.price}">
    </div>
  </div>`;
}

function openEntityForm(kind, existing) {
  const isSupplier = kind !== 'buyer';
  const d = existing || {};
  const rows = isSupplier
    ? (d.cats && d.cats.length ? d.cats : [null])
    : [];

  if (!isSupplier) {
    openSheet(`<div class="sheet-head">
      <div><h3>${existing ? '编辑买方' : '新建买方'}</h3></div>${closeBtn}
    </div>
    <div class="form-sec">基础信息</div>
    <div class="field"><label>企业 / 采购主体名称</label><input class="inp" id="f-name" value="${esc(d.name || '')}" placeholder="如：城南水果批发"></div>
    <div class="field-2">
      <div class="field"><label>类型</label>
        <select class="sel" id="f-type">${S.boot.enums.buyerTypes.map((t) => `<option ${t === d.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label>所属区域</label>
        <select class="sel" id="f-region">${regionOptions(d.regionId)}</select>
      </div>
    </div>
    <div class="field-3">
      <div class="field"><label>信用分</label><input class="inp" type="number" id="f-credit" value="${d.credit || 80}"></div>
      <div class="field"><label>履约率 %</label><input class="inp" type="number" id="f-fulfillment" value="${d.fulfillment || 85}"></div>
      <div class="field"><label>账期 天</label><input class="inp" type="number" id="f-pay" value="${d.payDays || 30}"></div>
    </div>
    <div class="field"><label>联系电话</label><input class="inp" id="f-phone" value="${esc(d.phone || '')}"></div>
    <div class="field"><label>在采品类</label>
      <div class="chips wrap">${S.boot.categories.map((c) => `<button type="button" class="chip ${(d.cats || []).includes(c.id) ? 'on' : ''}" data-bcat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    </div>
    <div class="sheet-acts">
      <button class="btn btn-quiet" data-close>取消</button>
      <button class="btn btn-primary" data-save="buyer">保存</button>
    </div>`);
    bindBuyerForm(existing);
    return;
  }

  openSheet(`<div class="sheet-head">
    <div><h3>${existing ? '编辑供方' : '新建供方'}</h3></div>${closeBtn}
  </div>
  <div class="form-sec">基础信息</div>
  <div class="field"><label>主体名称</label><input class="inp" id="f-name" value="${esc(d.name || '')}" placeholder="如：正平镇绿源种植合作社"></div>
  <div class="field-2">
    <div class="field"><label>主体类型</label>
      <select class="sel" id="f-level">${S.boot.enums.levels.map((t) => `<option ${t === d.level ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="field"><label>所属区域</label>
      <select class="sel" id="f-region">${regionOptions(d.regionId || S.loc.regionId)}</select>
    </div>
  </div>
  <div class="field"><label>所在村</label><input class="inp" id="f-village" value="${esc(d.village || '')}" placeholder="如：正平镇新屋村"></div>
  <div class="field-3">
    <div class="field"><label>总面积 亩</label><input class="inp" type="number" id="f-acreage" value="${d.acreage || 20}"></div>
    <div class="field"><label>信用分</label><input class="inp" type="number" id="f-credit" value="${d.credit || 80}"></div>
    <div class="field"><label>履约率 %</label><input class="inp" type="number" id="f-fulfillment" value="${d.fulfillment || 88}"></div>
  </div>
  <div class="field"><label>联系电话</label><input class="inp" id="f-phone" value="${esc(d.phone || '')}"></div>
  <div class="field"><label>认证</label>
    <div class="chips wrap">${S.boot.enums.certs.map((c) => `<button type="button" class="chip ${(d.certs || []).includes(c) ? 'on' : ''}" data-scert="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  </div>
  <div class="form-line">
    <div class="lb">滞销助农标记<small>命中后匹配加权 +10</small></div>
    <button type="button" class="switch ${d.stalled ? 'on' : ''}" id="f-stalled"><i></i></button>
  </div>
  <div class="form-sec">经营品类</div>
  <div id="cat-rows">${rows.map(entityCatRowHTML).join('')}</div>
  <button type="button" class="btn btn-quiet btn-sm btn-block" id="add-row">+ 添加品类</button>
  <div class="sheet-acts">
    <button class="btn btn-quiet" data-close>取消</button>
    <button class="btn btn-primary" data-save="supplier">保存</button>
  </div>`);

  bindSupplierForm(existing);
}

function regionOptions(sel) {
  const groups = [
    { name: '信丰县内', ids: ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11'] },
    { name: '省内 / 外省城市', ids: ['R12', 'R13', 'R14', 'R15', 'R16', 'R17'] },
  ];
  return groups.map((g) => `<optgroup label="${g.name}">${g.ids.map((id) => {
    const r = regionById(id);
    return r ? `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>` : '';
  }).join('')}</optgroup>`).join('');
}

function bindSupplierForm(existing) {
  const body = el('sheetBody');
  const certs = existing && existing.certs ? [...existing.certs] : [];
  let rowSeq = body.querySelectorAll('.cat-row').length;

  // 选中品类时自动带出可供月份与产地均价，避免新主体因 months 为空永远匹配不到
  function bindCatRow(row) {
    const sel = row.querySelector('[data-cf="catId"]');
    const months = row.querySelector('[data-cf="months"]');
    const price = row.querySelector('[data-cf="price"]');
    sel.addEventListener('change', () => {
      const c = catById(sel.value);
      if (!c) return;
      if (!months.value.trim()) months.value = c.months.length >= 12
        ? '1,2,3,4,5,6,7,8,9,10,11,12' : c.months.join(',');
      if (!Number(price.value)) price.value = c.basePrice;
    });
  }
  body.querySelectorAll('.cat-row').forEach(bindCatRow);

  body.querySelectorAll('[data-scert]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.scert;
    const i = certs.indexOf(c);
    if (i >= 0) certs.splice(i, 1); else certs.push(c);
    b.classList.toggle('on', certs.includes(c));
  }));
  const sw = body.querySelector('#f-stalled');
  sw.addEventListener('click', () => sw.classList.toggle('on'));

  body.querySelector('#add-row').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = entityCatRowHTML(null, rowSeq++);
    body.querySelector('#cat-rows').appendChild(div.firstElementChild);
    bindCatRow(body.querySelector('#cat-rows').lastElementChild);
    bindRowDelete();
  });
  function bindRowDelete() {
    body.querySelectorAll('[data-del-row]').forEach((b) => {
      b.onclick = () => {
        const row = b.closest('.cat-row');
        if (body.querySelectorAll('.cat-row').length <= 1) { toast('至少保留一个品类', 'err'); return; }
        row.remove();
      };
    });
  }
  bindRowDelete();

  body.querySelector('[data-save="supplier"]').addEventListener('click', async () => {
    const rows = [...body.querySelectorAll('.cat-row')].map((row) => {
      const get = (f) => row.querySelector(`[data-cf="${f}"]`).value;
      return {
        catId: get('catId'),
        variety: get('variety').trim(),
        area: Number(get('area')) || 1,
        supply: Number(get('supply')) || 1,
        months: get('months').split(/[,，\s]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 12),
        gradeA: Number(get('gradeA')) || 0,
        price: Number(get('price')) || 0,
        priceHigh: Number(get('price')) || 0,
      };
    }).filter((r) => r.catId);

    const payload = {
      name: body.querySelector('#f-name').value.trim(),
      regionId: body.querySelector('#f-region').value,
      level: body.querySelector('#f-level').value,
      village: body.querySelector('#f-village').value.trim(),
      acreage: Number(body.querySelector('#f-acreage').value) || 10,
      credit: Number(body.querySelector('#f-credit').value) || 70,
      fulfillment: Number(body.querySelector('#f-fulfillment').value) || 80,
      phone: body.querySelector('#f-phone').value.trim(),
      certs,
      stalled: sw.classList.contains('on'),
      cats: rows,
    };
    if (!payload.name || payload.name.length < 2) return toast('名称至少 2 个字', 'err');
    if (!rows.length) return toast('至少填写一个品类', 'err');
    try {
      if (existing) await api('/suppliers/' + existing.id, { method: 'PATCH', body: payload });
      else await api('/suppliers', { method: 'POST', body: payload });
      toast('已保存');
      closeSheet();
      S.home = null;
      if (S.page === 'entities') loadEntities(); else refreshPage();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function bindBuyerForm(existing) {
  const body = el('sheetBody');
  const cats = existing && existing.cats ? [...existing.cats] : [];
  body.querySelectorAll('[data-bcat]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.bcat;
    const i = cats.indexOf(c);
    if (i >= 0) cats.splice(i, 1); else cats.push(c);
    b.classList.toggle('on', cats.includes(c));
  }));
  body.querySelector('[data-save="buyer"]').addEventListener('click', async () => {
    const payload = {
      name: body.querySelector('#f-name').value.trim(),
      type: body.querySelector('#f-type').value,
      regionId: body.querySelector('#f-region').value,
      credit: Number(body.querySelector('#f-credit').value) || 75,
      fulfillment: Number(body.querySelector('#f-fulfillment').value) || 85,
      payDays: Number(body.querySelector('#f-pay').value) || 30,
      phone: body.querySelector('#f-phone').value.trim(),
      cats,
    };
    if (!payload.name) return toast('请填写名称', 'err');
    try {
      if (existing) await api('/buyers/' + existing.id, { method: 'PATCH', body: payload });
      else await api('/buyers', { method: 'POST', body: payload });
      toast('已保存');
      closeSheet();
      S.home = null;
      if (S.page === 'entities') loadEntities(); else refreshPage();
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ---------------- 需求表单 ---------------- */
async function openDemandForm(demand, buyer) {
  const d = demand || {};
  const cat = catById(d.catId) || S.boot.categories[0];
  let buyerList = null;
  if (!demand && !buyer) {
    try {
      const r = await api('/buyers?pageSize=100');
      buyerList = r.items;
    } catch { buyerList = []; }
  }

  openSheet(`<div class="sheet-head">
    <div><h3>${demand ? '编辑采购单' : '新建采购单'}</h3></div>${closeBtn}
  </div>
  ${buyerList ? `<div class="field"><label>采购主体 <span class="hint">选择后自动带出坐标</span></label>
    <select class="sel" id="d-buyer">${buyerList.map((b) => `<option value="${b.id}">${esc(b.name)}（${esc(b.type)}）</option>`).join('')}</select>
  </div>` : ''}
  <div class="field"><label>品类</label>
    <select class="sel" id="d-cat">${S.boot.categories.map((c) => `<option value="${c.id}" ${c.id === d.catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  </div>
  <div class="field-3">
    <div class="field"><label>数量 吨</label><input class="inp" type="number" id="d-qty" min="1" value="${d.qty || 20}"></div>
    <div class="field"><label>等级</label>
      <select class="sel" id="d-grade">${S.boot.enums.grades.map((g) => `<option ${g === d.grade ? 'selected' : ''}>${g}</option>`).join('')}</select>
    </div>
    <div class="field"><label>半径 km</label>
      <select class="sel" id="d-radius">${S.boot.enums.radii.map((r) => `<option value="${r}" ${Number(d.radius) === r ? 'selected' : ''}>${r >= 9999 ? '不限' : r}</option>`).join('')}</select>
    </div>
  </div>
  <div class="field-2">
    <div class="field"><label>目标价下限</label><input class="inp" type="number" step="0.01" id="d-low" value="${d.priceLow || money(cat.basePrice * 0.94)}"></div>
    <div class="field"><label>目标价上限</label><input class="inp" type="number" step="0.01" id="d-high" value="${d.priceHigh || money(cat.basePrice * 1.08)}"></div>
  </div>
  <div class="field-2">
    <div class="field"><label>起</label><input class="inp" type="date" id="d-from" value="${d.fromDate || plusDays(0)}"></div>
    <div class="field"><label>止</label><input class="inp" type="date" id="d-to" value="${d.toDate || plusDays(30)}"></div>
  </div>
  <div class="field-2">
    <div class="field"><label>物流</label>
      <select class="sel" id="d-logistics">${S.boot.enums.logistics.map((l) => `<option ${l === d.logistics ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="field"><label>结算</label>
      <select class="sel" id="d-settlement">${S.boot.enums.settlements.map((l) => `<option ${l === d.settlement ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
  </div>
  <div class="field"><label>紧急度</label>
    <div class="chips">${S.boot.enums.urgency.map((u) => `<button type="button" class="chip ${(d.urgency || '普通') === u ? 'on' : ''}" data-urg="${esc(u)}">${esc(u)}</button>`).join('')}</div>
  </div>
  <div class="field"><label>认证要求</label>
    <div class="chips wrap">${S.boot.enums.certs.map((c) => `<button type="button" class="chip ${(d.certs || []).includes(c) ? 'on' : ''}" data-dcert="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  </div>
  ${demand ? `<div class="field"><label>状态</label>
    <select class="sel" id="d-status"><option value="open" ${d.status === 'open' ? 'selected' : ''}>在售</option><option value="closed" ${d.status === 'closed' ? 'selected' : ''}>已关闭</option></select></div>` : ''}
  <div class="sheet-acts">
    <button class="btn btn-quiet" data-close>取消</button>
    <button class="btn btn-primary" id="d-save">保存</button>
  </div>`);

  const body = el('sheetBody');
  const certs = d.certs ? [...d.certs] : [];
  let urgency = d.urgency || '普通';
  body.querySelectorAll('[data-urg]').forEach((b) => b.addEventListener('click', () => {
    urgency = b.dataset.urg;
    body.querySelectorAll('[data-urg]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  body.querySelectorAll('[data-dcert]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.dcert;
    const i = certs.indexOf(c);
    if (i >= 0) certs.splice(i, 1); else certs.push(c);
    b.classList.toggle('on', certs.includes(c));
  }));

  body.querySelector('#d-save').addEventListener('click', async () => {
    const payload = {
      catId: body.querySelector('#d-cat').value,
      qty: Number(body.querySelector('#d-qty').value),
      grade: body.querySelector('#d-grade').value,
      radius: Number(body.querySelector('#d-radius').value),
      priceLow: Number(body.querySelector('#d-low').value),
      priceHigh: Number(body.querySelector('#d-high').value),
      fromDate: body.querySelector('#d-from').value,
      toDate: body.querySelector('#d-to').value,
      logistics: body.querySelector('#d-logistics').value,
      settlement: body.querySelector('#d-settlement').value,
      urgency, certs,
      sample: false,
      status: demand ? body.querySelector('#d-status').value : 'open',
    };
    if (!(payload.qty > 0)) return toast('数量需大于 0', 'err');
    try {
      if (demand) {
        await api('/demands/' + demand.id, { method: 'PATCH', body: payload });
      } else {
        const bid = (buyer && buyer.id) || (body.querySelector('#d-buyer') || {}).value;
        if (!bid) return toast('请先选择买方主体', 'err');
        await api('/demands', { method: 'POST', body: { ...payload, buyerId: bid } });
      }
      toast('已保存');
      closeSheet();
      S.home = null;
      if (S.page === 'entities') loadEntities(); else refreshPage();
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ---------------- 设置 ---------------- */
async function openSettings() {
  openSheet(`<div class="sheet-head"><div><h3>算法参数</h3><div class="sub">阈值影响硬过滤，权重影响排序</div></div>${closeBtn}</div><div class="sk sk-card"></div>`);
  try {
    const boot = await api('/bootstrap');
    const st = boot.settings;
    const rows = [
      ['thresholds.fulfillment', '履约率下限', '%', 40, 100],
      ['thresholds.credit', '信用分下限', '', 30, 100],
      ['thresholds.privateSales', '场外交易上限', '次', 0, 10],
      ['thresholds.capacityFactor', '产能系数', '', 0.3, 1],
      ['feed.lambda', '距离衰减 λ', 'km', 10, 200],
    ];
    const weights = [
      ['weights.content', '内容相似'], ['weights.quality', '品质信用'],
      ['weights.price', '价格适配'], ['weights.geo', '地域'],
    ];
    openSheet(`<div class="sheet-head">
      <div><h3>算法参数</h3><div class="sub">阈值影响过滤，权重影响排序</div></div>${closeBtn}
    </div>
    <div class="form-sec">硬过滤阈值</div>
    ${rows.map(([k, label, unit, min, max]) => `<div class="slider-row">
      <div class="slider-head"><span class="n">${label}</span><span class="v"><span data-v="${k}">${st[k]}</span>${unit}</span></div>
      <input type="range" min="${min}" max="${max}" step="${String(max - min).includes('.') ? 0.01 : (max < 10 ? 1 : 1)}" value="${st[k]}" data-set="${k}">
    </div>`).join('')}

    <div class="form-sec">排序权重</div>
    ${weights.map(([k, label]) => `<div class="w-row">
      <span class="n">${label}</span>
      <span class="bar"><i style="width:${Math.round(st[k] * 100)}%"></i></span>
      <span class="v">${Math.round(st[k] * 100)}%</span>
    </div>`).join('')}
    <div class="form-note">四项权重之和建议为 1。当前合计 ${Math.round((st['weights.content'] + st['weights.quality'] + st['weights.price'] + st['weights.geo']) * 100)}%。</div>

    <div class="form-sec">数据</div>
    <div class="kv"><span class="k">供方 / 买方 / 在售需求</span><span class="v">${boot.stats.suppliers} / ${boot.stats.buyers} / ${boot.stats.demands}</span></div>
    <div class="kv"><span class="k">撮合流水 / 检索记录</span><span class="v">${boot.stats.matches} / ${boot.stats.sessions}</span></div>
    <div class="sheet-acts">
      <button class="btn btn-quiet" data-close>关闭</button>
      <button class="btn btn-primary" id="set-save">保存</button>
    </div>`);

    const body = el('sheetBody');
    const pending = {};
    body.querySelectorAll('[data-set]').forEach((input) => {
      input.addEventListener('input', () => {
        pending[input.dataset.set] = Number(input.value);
        const out = body.querySelector(`[data-v="${input.dataset.set}"]`);
        if (out) out.textContent = input.value;
      });
    });
    body.querySelector('#set-save').addEventListener('click', async () => {
      if (!Object.keys(pending).length) { closeSheet(); return; }
      try {
        const r = await api('/settings', { method: 'PATCH', body: pending });
        S.boot.settings = r.settings;
        toast('设置已保存');
        closeSheet();
        S.home = null;
        if (S.page === 'match' && S.match.result) runMatch();
        else refreshPage();
      } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) {
    openSheet(`<div class="sheet-head"><div><h3>设置读取失败</h3><div class="sub">${esc(e.message)}</div></div>${closeBtn}</div>`);
  }
}
