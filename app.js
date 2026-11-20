(function(){
'use strict';
const DATA = (window.KB_DATA || []).map((r, i) => ({...r, _i: i, year: (r.date || '').slice(0, 4) || '未知'}));
const $ = s => document.querySelector(s);
const store = {
  get(k, d){ try{ const v = localStorage.getItem('lessonkb.' + k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('lessonkb.' + k, JSON.stringify(v)); }catch(e){} }
};
let favs = new Set(store.get('favs', []));

// 篩選維度：key = 資料欄位
const DIMS = [
  {key:'category', label:'類別'},
  {key:'audience', label:'對象'},
  {key:'domains',  label:'訓練領域'},
  {key:'formats',  label:'形式'},
  {key:'themes',   label:'主題'},
  {key:'year',     label:'年份'},
  {key:'source',   label:'來源'},
];
const vals = (r, k) => { const v = r[k]; return Array.isArray(v) ? v : (v ? [v] : []); };

const state = {
  q: '', sort: store.get('sort', 'new'), view: store.get('view', 'cards'),
  sel: Object.fromEntries(DIMS.map(d => [d.key, new Set()])), onlyFav: false, onlyLesson: store.get('onlyLesson', true),
  shown: 60,
};

// ---------- 搜尋 ----------
function terms(){ return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean); }
function hay(r){
  return r._hay || (r._hay = [r.title, r.summary, (r.materials||[]).join(' '), r.keyword, r.text,
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
    if(state.onlyLesson && !r.lesson) return false;
    if(state.onlyFav && !favs.has(r.id)) return false;
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
    <label class="opt"><input type="checkbox" id="onlyLesson" ${state.onlyLesson?'checked':''}> 只看教案／活動素材 <span class="n">${DATA.filter(r=>r.lesson).length}</span></label>
    <label class="opt"><input type="checkbox" id="onlyFav" ${state.onlyFav?'checked':''}> 只看我的收藏 <span class="n">${favs.size}</span></label>`;
  box.appendChild(top);
  top.querySelector('#onlyLesson').onchange = e => { state.onlyLesson = e.target.checked; store.set('onlyLesson', state.onlyLesson); update(); };
  top.querySelector('#onlyFav').onchange = e => { state.onlyFav = e.target.checked; update(); };

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
function thumbHTML(r){
  return r.img ? `<div class="thumb" style="background-image:url('${esc(r.img)}')" data-img></div>` : `<div class="thumb">📄</div>`;
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
    box.innerHTML = `<table class="list"><thead><tr><th>日期</th><th>標題</th><th>類別</th><th>對象／領域</th><th></th></tr></thead><tbody>${
      slice.map(r => `<tr data-i="${r._i}"><td class="d">${esc(r.date)}</td><td>${hl(r.title)}</td><td>${esc(r.category||'')}</td><td>${tagsHTML(r, 5)}</td><td><button class="star ${favs.has(r.id)?'on':''}" data-fav="${esc(r.id)}" title="收藏">${favs.has(r.id)?'★':'☆'}</button></td></tr>`).join('')
    }</tbody></table>`;
  } else {
    box.innerHTML = `<div class="grid">${slice.map(r => `
      <div class="card" role="button" tabindex="0" data-i="${r._i}">
        ${thumbHTML(r)}
        <div class="cbody">
          <div class="ctitle">${hl(r.title)}</div>
          <div class="csum">${hl(r.summary || r.text.slice(0, 120))}</div>
          <div class="meta">${r.category?`<span class="tag cat">${esc(r.category)}</span>`:''}${tagsHTML(r, 3)}</div>
          <div class="meta"><span>${esc(r.date)}</span>${r.keyword?`<span>留言「${esc(r.keyword)}」</span>`:''}<button class="star ${favs.has(r.id)?'on':''}" data-fav="${esc(r.id)}" title="收藏">${favs.has(r.id)?'★':'☆'}</button></div>
        </div>
      </div>`).join('')}</div>`;
    // 臉書圖片網址會過期：載入失敗就換成圖示
    box.querySelectorAll('[data-img]').forEach(el => {
      const url = el.style.backgroundImage.slice(5, -2); const im = new Image();
      im.onerror = () => { el.style.backgroundImage = ''; el.textContent = '📄'; }; im.src = url;
    });
  }
  const m = $('#more'); m.innerHTML = '';
  if(list.length > state.shown){
    const b = document.createElement('button'); b.className = 'btn ghost';
    b.textContent = `再顯示 ${Math.min(60, list.length - state.shown)} 筆（共 ${list.length}）`;
    b.onclick = () => { state.shown += 60; renderResults(); }; m.appendChild(b);
  }
}

function update(){ renderFacets(); renderChips(); renderResults(); }

// ---------- 詳細頁 ----------
const PROMPTS = [
  ['改編成其他對象', r => `以下是我過去設計的教案。請幫我改編成適合「（填入對象，例如：輕度失智長輩／國小低年級）」的版本，保留核心訓練目標，列出：活動目標、所需教具、帶領步驟（含時間）、難度調整方式、注意事項。\n\n【原教案】${r.title}\n${r.text}`],
  ['整理成教案格式', r => `請把以下臉書貼文整理成正式教案格式：活動名稱、適用對象、訓練目標（職能治療觀點）、教具清單、活動流程（暖身／主活動／結束分享，含時間）、分級調整、成效觀察指標。\n\n${r.text}`],
  ['延伸成系列課程', r => `請以以下教案為核心，延伸設計 4 週的系列課程，每週一個主題、逐週提高難度，並附每週教具與帶領重點。\n\n${r.text}`],
  ['做成互動簡報', r => `請根據以下教案，設計一份給長者團體使用的互動簡報大綱（約 15 頁），包含開場提問、示範、互動遊戲頁、回顧與分享。\n\n${r.text}`],
];
function openDetail(r){
  const dl = (label, arr) => arr && arr.length ? `<dt>${label}</dt><dd>${arr.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</dd>` : '';
  $('#detailBody').innerHTML = `
    <div class="dhead"><h2>${esc(r.title)}</h2>
      <button class="star ${favs.has(r.id)?'on':''}" data-fav="${esc(r.id)}" title="收藏" style="font-size:22px">${favs.has(r.id)?'★':'☆'}</button>
      <button class="x" data-close aria-label="關閉">×</button></div>
    <div class="dbody">
      ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}
      <dl class="kv">
        <dt>日期</dt><dd>${esc(r.date || '未知')}・${esc(r.source)}${r.reposts ? `（另於 ${r.reposts.map(esc).join('、')} 重發）` : ''}</dd>
        ${r.category ? `<dt>類別</dt><dd><span class="tag cat">${esc(r.category)}</span></dd>` : ''}
        ${dl('對象', r.audience)}${dl('訓練領域', r.domains)}${dl('形式', r.formats)}${dl('主題', r.themes)}${dl('教具／材料', r.materials)}
        ${r.keyword ? `<dt>留言關鍵字</dt><dd>「${esc(r.keyword)}」</dd>` : ''}
      </dl>
      <div class="actions">
        ${r.href ? `<a class="btn" href="${esc(r.href)}" target="_blank" rel="noopener">開啟臉書原文</a>` : ''}
        <button class="btn ghost" data-copy="text">複製全文</button>
      </div>
      <div class="prompts"><span class="inline">複製給 Claude：</span>${PROMPTS.map((p,i) => `<button class="chip" data-prompt="${i}">${p[0]}</button>`).join('')}</div>
      <h3 style="font-size:14px;color:var(--muted);margin:16px 0 6px">貼文全文</h3>
      ${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="full">${hl(r.text)}</div>
    </div>`;
  const dlg = $('#detail');
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.querySelector('[data-copy]').onclick = () => copy(r.text, '已複製全文');
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
  const cols = ['date','title','category','audience','domains','formats','themes','materials','keyword','summary','href','text'];
  const cell = v => '"' + String(Array.isArray(v) ? v.join('、') : (v ?? '')).replace(/"/g, '""') + '"';
  const csv = '﻿' + cols.join(',') + '\n' + list.map(r => cols.map(c => cell(r[c])).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = `教案知識庫_${list.length}筆.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

update();
})();
