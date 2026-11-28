// Copyright (c) 2026 李硕
// SPDX-License-Identifier: MIT
/* =========================================================
   app.js —— 启动与全局事件
========================================================= */

function bindChrome() {
  $$('.nav-item').forEach((tab) => {
    tab.addEventListener('click', () => goPage(tab.dataset.tab));
  });

  const lat = el('origin-lat');
  const lng = el('origin-lng');
  const apply = () => applyOrigin(lat.value, lng.value);
  el('apply-origin').addEventListener('click', apply);
  [lat, lng].forEach((input) => input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply();
  }));

  $$('[data-act="open-settings"]').forEach((b) => b.addEventListener('click', openSettings));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });
}

async function boot() {
  try {
    S.boot = await api('/bootstrap');
  } catch (e) {
    el('page-home').innerHTML = `<div class="card empty-card" style="margin-top:40px">
      服务未就绪：${esc(e.message)}<br><br>请确认已在项目目录运行 <b>npm start</b> 或双击 start.bat</div>`;
    return;
  }

  if (!regionById(S.loc.regionId)) {
    const near = nearestRegion(S.loc.lat, S.loc.lng);
    if (near.region) S.loc.regionId = near.region.id;
  }
  if (!S.match.from) S.match.from = plusDays(0);
  if (!S.match.to) S.match.to = plusDays(30);

  bindSheetBasics();
  bindChrome();
  syncOriginUI();
  goPage('home');
}

document.addEventListener('DOMContentLoaded', boot);
