(function(){
'use strict';
const DATA = (window.KB_DATA || []).map((r, i) => ({...r, _i: i, year: (r.date || '').slice(0, 4) || '未知',
  links: r.links || [], web: (r.links && r.links.length) ? '有教案網頁' : '只有臉書貼文'}));
const host = u => { try{ const x = new URL(u); return x.host + x.pathname.replace(/\/$/, ''); }catch(e){ return u; } };
const $ = s => document.querySelector(s);
const store = {
  get(k, d){ try{ const v = localStorage.getItem('lessonkb.' + k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('lessonkb.' + k, JSON.stringify(v)); }catch(e){} }
};
let favs = new Set(store.get('favs', []));
let picks = store.get('picks', []).filter(id => DATA.some(r => r.id === id)); // 多選（保留勾選順序）
const BYID = new Map(DATA.map(r => [r.id, r]));
const isPicked = id => picks.includes(id);
function togglePick(id, on){
  const has = isPicked(id); if(on === undefined) on = !has;
  if(on && !has) picks.push(id); if(!on && has) picks = picks.filter(x => x !== id);
  store.set('picks', picks);
}

// 篩選維度：key = 資料欄位
const DIMS = [
  {key:'web',      label:'教案網頁'},
  {key:'category', label:'類別'},
  {key:'audience', label:'對象'},
  {key:'domains',  label:'訓練領域'},
  {key:'formats',  label:'形式'},
  {key:'themes',   label:'主題'},
  {key:'year',     label:'年份'},
];
const vals = (r, k) => { const v = r[k]; return Array.isArray(v) ? v : (v ? [v] : []); };

const state = {
  q: '', sort: store.get('sort', 'new'), view: store.get('view', 'cards'),
  sel: Object.fromEntries(DIMS.map(d => [d.key, new Set()])), onlyFav: false, onlyPick: false,
  shown: 60,
};

// ---------- 搜尋 ----------
function terms(){ return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean); }
function hay(r){
  return r._hay || (r._hay = [r.title, r.summary, (r.materials||[]).join(' '), r.keyword, r.text, r.links.map(l => l.url).join(' '),
    ...DIMS.flatMap(d => vals(r, d.key))].join('\n').toLowerCase());
}
function score(r, ts){
  let s = 0; const t = (r.title||'').toLowerCase(), su = (r.summary||'').toLowerCase();
  for(const w of ts){ if(t.includes(w)) s += 10; if(su.includes(w)) s += 4; if((r.keyword||'').toLowerCase().includes(w)) s += 6; s += Math.min(5, hay(r).split(w).length - 1); }
  return s;
}

function filtered(exceptDim){
  const ts = terms();
  return DATA.filter(r => {
    if(state.onlyFav && !favs.has(r.id)) return false;
    if(state.onlyPick && !isPicked(r.id)) return false;
    for(const d of DIMS){
      if(d.key === exceptDim) continue;
      const s = state.sel[d.key]; if(!s.size) continue;
      if(!vals(r, d.key).some(v => s.has(v))) return false;
    }
    for(const w of ts) if(!hay(r).includes(w)) return false;
    return true;
  });
}

// ---------- 篩選面板 ----------
function renderFacets(){
  const box = $('#facets'); box.innerHTML = '';
  const top = document.createElement('div'); top.className = 'facet';
  top.innerHTML = `<h3>顯示範圍</h3>
    <label class="opt"><input type="checkbox" id="onlyFav" ${state.onlyFav?'checked':''}> 只看我的收藏 <span class="n">${favs.size}</span></label>
    <label class="opt"><input type="checkbox" id="onlyPick" ${state.onlyPick?'checked':''}> 只看已勾選 <span class="n">${picks.length}</span></label>`;
  box.appendChild(top);
  top.querySelector('#onlyFav').onchange = e => { state.onlyFav = e.target.checked; update(); };
  top.querySelector('#onlyPick').onchange = e => { state.onlyPick = e.target.checked; update(); };

  for(const d of DIMS){
    const base = filtered(d.key);
    const counts = new Map();
    for(const r of base) for(const v of vals(r, d.key)) counts.set(v, (counts.get(v)||0) + 1);
    // 全部可能值（含 0 筆，保持位置穩定）
    const all = new Map();
    for(const r of DATA) for(const v of vals(r, d.key)) all.set(v, (all.get(v)||0) + 1);
    let keys = [...all.keys()];
    if(d.key === 'year') keys.sort().reverse(); else keys.sort((a,b) => all.get(b) - all.get(a));
    // 主題標籤很多：篩選面板只列出用過 3 次以上的（其餘仍可搜尋）
    if(d.key === 'themes') keys = keys.filter(k => all.get(k) >= 3 || state.sel.themes.has(k));
    if(!keys.length) continue;
    const f = document.createElement('div'); f.className = 'facet';
    const sel = state.sel[d.key];
    f.innerHTML = `<h3>${d.label}${sel.size?'<button>清除</button>':''}</h3>`;
    if(sel.size) f.querySelector('button').onclick = () => { sel.clear(); update(); };
    for(const k of keys){
      const n = counts.get(k) || 0;
      const l = document.createElement('label'); l.className = 'opt' + (n || sel.has(k) ? '' : ' zero');
      l.innerHTML = `<input type="checkbox" ${sel.has(k)?'checked':''}> <span></span> <span class="n">${n}</span>`;
      l.querySelector('span').textContent = k;
      l.querySelector('input').onchange = e => { e.target.checked ? sel.add(k) : sel.delete(k); state.shown = 60; update(); };
      f.appendChild(l);
    }
    box.appendChild(f);
  }
}

function renderChips(){
  const c = $('#chips'); c.innerHTML = '';
  for(const d of DIMS) for(const v of state.sel[d.key]){
    const b = document.createElement('button'); b.className = 'chip on'; b.textContent = v + ' ×';
    b.title = '移除「' + v + '」'; b.onclick = () => { state.sel[d.key].delete(v); update(); };
    c.appendChild(b);
  }
}

// ---------- 結果 ----------
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function hl(s){
  let h = esc(s); const ts = terms(); if(!ts.length) return h;
  for(const w of ts){ const re = new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'); h = h.replace(re, m => '<mark>' + m + '</mark>'); }
  return h;
}
function sorted(list){
  const ts = terms();
  if(state.sort === 'rel' && ts.length) return list.map(r => [score(r, ts), r]).sort((a,b) => b[0]-a[0] || (b[1].date||'').localeCompare(a[1].date||'')).map(x => x[1]);
  const dir = state.sort === 'old' ? 1 : -1;
  return list.slice().sort((a,b) => dir * (a.date||'').localeCompare(b.date||''));
}
// 沒有圖（或載入失敗）時，用類別配色＋標題做封面，不留空白
const COVER = {'教案/活動設計':'c1','網頁工具/生成器':'c2','紙本學習單/教材':'c3','影片/律動示範':'c4','衛教/知識文章':'c5','實務指南/工具包':'c6','課程講座/活動公告':'c7'};
function coverHTML(r){
  return `<div class="thumb cover ${COVER[r.category]||'c0'}"><span>${esc(r.title)}</span><small>${esc(r.category||'')}</small></div>`;
}
function thumbHTML(r){
  return r.img ? `<div class="thumb" style="background-image:url('${esc(r.img)}')" data-img="${r._i}"></div>` : coverHTML(r);
}
function tagsHTML(r, max){
  const t = [...vals(r,'domains'), ...vals(r,'audience')].slice(0, max);
  return t.map(x => `<span class="tag">${esc(x)}</span>`).join('');
}

function renderResults(){
  const list = sorted(filtered());
  $('#count').textContent = `${list.length} 筆`;
  const box = $('#results'); const slice = list.slice(0, state.shown);
  if(!list.length){ box.innerHTML = '<div class="empty">沒有符合的教案，試著減少篩選條件或換個關鍵字。</div>'; $('#more').innerHTML=''; return; }
  if(state.view === 'table'){
    box.innerHTML = `<table class="list"><thead><tr><th>日期</th><th>標題</th><th>類別</th><th>對象／領域</th><th>網頁</th><th></th></tr></thead><tbody>${
      slice.map(r => `<tr data-i="${r._i}" class="${isPicked(r.id)?'picked':''}"><td class="d">${esc(r.date)}</td><td>${hl(r.title)}</td><td>${esc(r.category||'')}</td><td>${tagsHTML(r, 5)}</td><td>${r.links.length ? `<a class="golink" href="${esc(r.links[0].url)}" target="_blank" rel="noopener" data-out>開啟 ↗</a>` : ''}</td><td class="acts"><label class="pick" data-pick="${esc(r.id)}" title="勾選，之後一起複製"><input type="checkbox" ${isPicked(r.id)?'checked':''}></label><button class="star ${favs.has(r.id)?'on':''}" data-fav="${esc(r.id)}" title="收藏">${favs.has(r.id)?'★':'☆'}</button></td></tr>`).join('')
    }</tbody></table>`;
  } else {
    box.innerHTML = `<div class="grid">${slice.map(r => `
      <div class="card ${isPicked(r.id)?'picked':''}" role="button" tabindex="0" data-i="${r._i}">
        <label class="pick" data-pick="${esc(r.id)}" title="勾選，之後一起複製"><input type="checkbox" ${isPicked(r.id)?'checked':''}></label>
        ${thumbHTML(r)}
        <div class="cbody">
          <div class="ctitle">${hl(r.title)}</div>
          <div class="csum">${hl(r.summary || r.text.slice(0, 120))}</div>
          <div class="meta">${r.category?`<span class="tag cat">${esc(r.category)}</span>`:''}${tagsHTML(r, 3)}</div>
          ${r.links.length ? `<a class="btn openweb" href="${esc(r.links[0].url)}" target="_blank" rel="noopener" data-out>開啟教案網頁 ↗</a>` : `<span class="noweb">尚未對應到網頁，可看臉書原文</span>`}
          <div class="meta"><span>${esc(r.date)}</span>${r.keyword?`<span>留言「${esc(r.keyword)}」</span>`:''}<button class="star ${favs.has(r.id)?'on':''}" data-fav="${esc(r.id)}" title="收藏">${favs.has(r.id)?'★':'☆'}</button></div>
        </div>
      </div>`).join('')}</div>`;
    // 圖片載入失敗就換成文字封面
    box.querySelectorAll('[data-img]').forEach(el => {
      const url = el.style.backgroundImage.slice(5, -2); const im = new Image();
      im.onerror = () => { el.outerHTML = coverHTML(DATA[+el.dataset.img]); }; im.src = url;
    });
  }
  const m = $('#more'); m.innerHTML = '';
  if(list.length > state.shown){
    const b = document.createElement('button'); b.className = 'btn ghost';
    b.textContent = `再顯示 ${Math.min(60, list.length - state.shown)} 筆（共 ${list.length}）`;
    b.onclick = () => { state.shown += 60; renderResults(); }; m.appendChild(b);
  }
}

function update(){ renderFacets(); renderChips(); renderResults(); renderBar(); }

// ---------- 多選工具列 ----------
const one = (r, n) => `【教案 ${n}】${r.title}\n` + (r.links.length ? `網頁：${r.links.map(l => l.url).join('\n　　　')}\n` : '') +
  (r.summary ? `摘要：${r.summary}\n` : '') + `原文：\n${r.text}`;
const many = list => list.map((r, i) => one(r, i + 1)).join('\n\n────────\n\n');
const MULTI = [
  ['做成簡報', l => `以下是我做過的 ${l.length} 份教案（有網頁的請先打開了解內容）。請參考這些教案，幫我做一份給長者團體使用的互動簡報（單一 HTML 檔，約 15–20 頁），整合各教案的活動與重點，包含開場提問、示範、互動遊戲頁、回顧與分享。\n\n${many(l)}`],
  ['做成講義', l => `以下是我做過的 ${l.length} 份教案（有網頁的請先打開了解內容）。請參考這些教案，幫我整理成一份可列印的 A4 講義／學習單（字大、版面清楚），整合活動目標、步驟、練習題與居家延伸建議。\n\n${many(l)}`],
  ['做成網頁', l => `以下是我做過的 ${l.length} 份互動教案網頁與介紹。請先打開各網頁了解玩法，再參考它們做一個新的互動教案網頁（單一 HTML 檔），融合這些教案的優點，並說明設計重點。\n\n${many(l)}`],
  ['整合成系列課程', l => `以下是我做過的 ${l.length} 份教案。請把它們整合成一套系列課程，安排先後順序與難度遞進，列出每堂課的目標、教具、帶領流程與時間。\n\n${many(l)}`],
];
function picked(){ return picks.map(id => BYID.get(id)).filter(Boolean); }
function renderBar(){
  let bar = $('#pickbar');
  if(!bar){ bar = document.createElement('div'); bar.id = 'pickbar'; bar.className = 'pickbar'; document.body.appendChild(bar); }
  const vis = sorted(filtered()); const notIn = vis.filter(r => !isPicked(r.id)).length;
  if(!picks.length){
    bar.className = 'pickbar mini';
    bar.innerHTML = `<span class="ptip">勾選卡片左上角的方框可以多選，再一起複製給 Claude</span>${vis.length && vis.length <= 60 ? `<button class="btn ghost" data-pa="all">全選目前 ${vis.length} 筆</button>` : ''}`;
    return;
  }
  bar.className = 'pickbar';
  bar.innerHTML = `<b>已選 ${picks.length} 篇</b>
    <span class="pgroup"><span class="plabel">複製給 Claude：</span>${MULTI.map((m,i) => `<button class="chip" data-pm="${i}">${m[0]}</button>`).join('')}</span>
    <span class="pgroup">
      <button class="btn ghost" data-pa="content">複製內容</button>
      <button class="btn ghost" data-pa="urls">複製網頁連結</button>
      <button class="btn ghost" data-pa="list">${state.onlyPick ? '顯示全部' : '只看已選'}</button>
      ${notIn && vis.length <= 200 ? `<button class="btn ghost" data-pa="all">加選目前 ${notIn} 筆</button>` : ''}
      <button class="btn ghost" data-pa="clear">清除</button>
    </span>`;
}
function syncPick(id){
  document.querySelectorAll(`[data-pick="${CSS.escape(id)}"]`).forEach(l => {
    const on = isPicked(id); const i = l.querySelector('input'); if(i) i.checked = on;
    const host = l.closest('.card, tr'); if(host) host.classList.toggle('picked', on);
    if(l.matches('button')) l.textContent = on ? '✓ 已加入多選' : '＋ 加入多選';
  });
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-pm]');
  if(m){ const l = picked(); copy(MULTI[+m.dataset.pm][1](l), `已複製 ${l.length} 篇的提示詞，貼到 Claude 即可`); return; }
  const a = e.target.closest('[data-pa]'); if(!a) return;
  const act = a.dataset.pa, l = picked();
  if(act === 'content') copy(many(l), `已複製 ${l.length} 篇內容`);
  if(act === 'urls'){ const u = l.filter(r => r.links.length).map(r => `${r.title}\n${r.links[0].url}`);
    u.length ? copy(u.join('\n\n'), `已複製 ${u.length} 個網頁連結` + (u.length < l.length ? `（${l.length - u.length} 篇沒有網頁）` : '')) : toast('選取的教案都沒有網頁'); }
  if(act === 'list'){ state.onlyPick = !state.onlyPick; state.shown = 60; update(); }
  if(act === 'all'){ sorted(filtered()).forEach(r => togglePick(r.id, true)); update(); toast(`已選 ${picks.length} 篇`); }
  if(act === 'clear'){ picks = []; store.set('picks', picks); state.onlyPick = false; update(); }
});

// ---------- 詳細頁 ----------
const src = r => (r.links.length ? `【教案網頁】${r.links[0].url}\n` : '') + `【原教案】${r.title}\n${r.text}`;
const PROMPTS = [
  ['依網頁做延伸版', r => `以下是我做過的互動教案網頁與介紹貼文。請先打開網頁了解玩法，再幫我設計一個延伸版本（換主題或提高難度），說明要改哪些內容、新增哪些關卡，並直接產出可用的單一 HTML 檔。\n\n${src(r)}`],
  ['改編成其他對象', r => `以下是我過去設計的教案。請幫我改編成適合「（填入對象，例如：輕度失智長輩／國小低年級）」的版本，保留核心訓練目標，列出：活動目標、所需教具、帶領步驟（含時間）、難度調整方式、注意事項。\n\n${src(r)}`],
  ['整理成教案格式', r => `請把以下臉書貼文整理成正式教案格式：活動名稱、適用對象、訓練目標（職能治療觀點）、教具清單、活動流程（暖身／主活動／結束分享，含時間）、分級調整、成效觀察指標。\n\n${src(r)}`],
  ['延伸成系列課程', r => `請以以下教案為核心，延伸設計 4 週的系列課程，每週一個主題、逐週提高難度，並附每週教具與帶領重點。\n\n${src(r)}`],
  ['做成互動簡報', r => `請根據以下教案，設計一份給長者團體使用的互動簡報大綱（約 15 頁），包含開場提問、示範、互動遊戲頁、回顧與分享。\n\n${src(r)}`],
];
function openDetail(r){
  const dl = (label, arr) => arr && arr.length ? `<dt>${label}</dt><dd>${arr.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</dd>` : '';
  $('#detailBody').innerHTML = `
    <div class="dhead"><h2>${esc(r.title)}</h2>
      <button class="star ${favs.has(r.id)?'on':''}" data-fav="${esc(r.id)}" title="收藏" style="font-size:22px">${favs.has(r.id)?'★':'☆'}</button>
      <button class="x" data-close aria-label="關閉">×</button></div>
    <div class="dbody">
      ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}
      ${r.links.length ? `<p class="weburl">${r.links.map((l,i) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${i ? '其他版本：' : ''}${esc(host(l.url))}</a>`).join('')}</p>` : '<p class="noweb">這篇還沒對應到教案網頁（可能是留言索取或外部連結），可開臉書原文查看。</p>'}
      <dl class="kv">
        <dt>日期</dt><dd>${esc(r.date || '未知')}・${esc(r.source)}${r.reposts ? `（另於 ${r.reposts.map(esc).join('、')} 重發）` : ''}</dd>
        ${r.category ? `<dt>類別</dt><dd><span class="tag cat">${esc(r.category)}</span></dd>` : ''}
        ${dl('對象', r.audience)}${dl('訓練領域', r.domains)}${dl('形式', r.formats)}${dl('主題', r.themes)}${dl('教具／材料', r.materials)}
        ${r.keyword ? `<dt>留言關鍵字</dt><dd>「${esc(r.keyword)}」</dd>` : ''}
      </dl>
      <div class="actions">
        ${r.links.length ? `<a class="btn" href="${esc(r.links[0].url)}" target="_blank" rel="noopener">開啟教案網頁 ↗</a>` : ''}
        ${r.href ? `<a class="btn ${r.links.length ? 'ghost' : ''}" href="${esc(r.href)}" target="_blank" rel="noopener">臉書原文</a>` : ''}
        ${r.links.length ? `<button class="btn ghost" data-copy="url">複製網頁連結</button>` : ''}
        <button class="btn ghost" data-copy="text">複製全文</button>
        <button class="btn ghost" data-pick="${esc(r.id)}">${isPicked(r.id) ? '✓ 已加入多選' : '＋ 加入多選'}</button>
      </div>
      <div class="prompts"><span class="inline">複製給 Claude：</span>${PROMPTS.map((p,i) => `<button class="chip" data-prompt="${i}">${p[0]}</button>`).join('')}</div>
      <h3 style="font-size:14px;color:var(--muted);margin:16px 0 6px">貼文全文</h3>
      ${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="full">${hl(r.text)}</div>
    </div>`;
  const dlg = $('#detail');
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.querySelector('[data-copy="text"]').onclick = () => copy(r.text, '已複製全文');
  const cu = dlg.querySelector('[data-copy="url"]'); if(cu) cu.onclick = () => copy(r.links[0].url, '已複製網頁連結');
  dlg.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => copy(PROMPTS[+b.dataset.prompt][1](r), '已複製提示詞，貼到 Claude 即可'));
  if(!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
function copy(t, msg){
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(msg), () => {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast(msg); }catch(e){ toast('複製失敗'); } ta.remove();
  });
}
function toast(m){ const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 1800); }

// ---------- 事件 ----------
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fav]');
  if(f){ e.stopPropagation(); const id = f.dataset.fav; favs.has(id) ? favs.delete(id) : favs.add(id); store.set('favs', [...favs]);
    document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach(x => { x.classList.toggle('on', favs.has(id)); x.textContent = favs.has(id) ? '★' : '☆'; });
    if(state.onlyFav) update(); else renderFacets(); return; }
  const pk = e.target.closest('[data-pick]');
  if(pk){ e.stopPropagation(); if(pk.matches('label') && e.target.tagName !== 'INPUT') return; // label 會再觸發一次 input click
    const id = pk.dataset.pick; togglePick(id); syncPick(id);
    if(state.onlyPick) renderResults(); renderFacets(); renderBar(); return; }
  if(e.target.closest('[data-out]')) return;
  const c = e.target.closest('[data-i]');
  if(c && !e.target.closest('dialog')) openDetail(DATA[+c.dataset.i]);
});
document.addEventListener('keydown', e => {
  if(e.key === 'Enter' && e.target.matches('.card')) openDetail(DATA[+e.target.dataset.i]);
  if(e.key === '/' && document.activeElement !== $('#q') && !$('#detail').open){ e.preventDefault(); $('#q').focus(); }
});
$('#detail').addEventListener('click', e => { if(e.target === $('#detail')) $('#detail').close(); });
let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; state.shown = 60; update(); }, 150); });
$('#sort').value = state.sort;
$('#sort').onchange = e => { state.sort = e.target.value; store.set('sort', state.sort); renderResults(); };
document.querySelectorAll('.seg button').forEach(b => {
  b.classList.toggle('on', b.dataset.view === state.view);
  b.onclick = () => { state.view = b.dataset.view; store.set('view', state.view); document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); renderResults(); };
});
$('#toggleFacets').onclick = () => $('#facets').classList.toggle('open');
$('#export').onclick = () => {
  const list = sorted(filtered());
  const cols = ['date','title','weburl','category','audience','domains','formats','themes','materials','keyword','summary','href','text'];
  const cell = v => '"' + String(Array.isArray(v) ? v.join('、') : (v ?? '')).replace(/"/g, '""') + '"';
  const csv = '﻿' + cols.join(',') + '\n' + list.map(r => cols.map(c => cell(c === 'weburl' ? r.links.map(l => l.url) : r[c])).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = `教案知識庫_${list.length}筆.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

update();
})();
