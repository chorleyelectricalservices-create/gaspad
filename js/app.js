import { db } from './db.js';
import { FORMS, formById } from './forms.js';
import { get, set, plus12m, coRatio, isoDate } from './cp12.js';
import { icon, MARK } from './icons.js';
import { importPrompt, normImport } from './importer.js';
import { allocateRef, planRestore, isDuplicate, cleanPrefix } from './refno.js';
import { lookupPostcode, formatAddress, ADDR_PROVIDERS, getAddrKey, setAddrKey } from './address.js';
import { fieldKind, normaliseForField, formatPostcode } from './fieldvoice.js';
import { getKey, setKey, KEY_URL, scanBadge, badgePlan, BADGE_LABELS, AiError, askGeminiText, askGemini } from './ai.js';
import { Dictation, useContinuous } from './sr.js';
import { parseSpeech, geminiPrompt, fromGemini } from './speak.js';
import { buildPdf, pdfName } from './pdf.js';

export const APP_VERSION = '2.0.0';
const $ = s => document.querySelector(s); const main = $('#main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const ukDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
let settings = { refPrefix: 'GAS', nextNumber: 1, engineer: {}, aiModel: '', addrProvider: '' };
let job = null, tab = 'details', saveT = null, lastField = null;

function toast(msg, ms = 3500, act) { const t = $('#toast'); t.innerHTML = esc(msg) + (act ? ` <button class="btn" id="tact">${esc(act.label)}</button>` : ''); t.hidden = false;
  if (act) $('#tact').onclick = () => { t.hidden = true; act.fn(); }; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }
function modal(html) { $('#modalBody').innerHTML = html; const m = $('#modal'); if (!m.open) m.showModal(); $('#modalBody').querySelectorAll('#mclose').forEach(b => (b.onclick = closeModal)); }
const closeModal = () => $('#modal').close();
function top(title, sub = '', back = false) { $('#topTitle').textContent = title; $('#topSub').textContent = sub; $('#backBtn').hidden = !back; $('#mark').hidden = back; }

async function saveSettings() { await db.setKV('settings', settings); }
function scheduleSave() { $('#saveState').textContent = '…'; clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
async function saveNow() { if (!job) return; clearTimeout(saveT); job.updated = Date.now(); await db.putJob(job); $('#saveState').textContent = '✓ saved'; }

// ---------- router ----------
async function route() {
  if (job) await saveNow();
  const h = location.hash.replace(/^#\/?/, '').split('/');
  $('#tabs').hidden = true; $('#toast').hidden = true; document.querySelector('#selbar')?.remove(); fab(''); document.body.classList.remove('inform'); scrollTo(0, 0);
  if (h[0] === 'job' && h[1]) { job = await db.getJob(h[1]); if (!job) return (location.hash = '#/'); tab = h[2] || 'details'; return renderJob(); }
  job = null;
  if (h[0] === 'settings') return renderSettings();
  return renderHome();
}
$('#backBtn').onclick = () => (location.hash = '#/');
$('#mark').innerHTML = MARK;
$('#settingsBtn').onclick = () => (location.hash = '#/settings');
addEventListener('hashchange', route);

// ---------- home ----------
const FORM_TONE = { cp12: 'green', service: 'blue', warning: 'red', commission: 'violet', tightness: 'amber' };
const pill = f => `<span class="tpill ${FORM_TONE[f.id] || ''}">${icon(f.icon)}${esc(f.short)}</span>`;
function pickerHtml() {
  return `<div class="tiles">${FORMS.map(f => `<button class="tile ${FORM_TONE[f.id]}" data-new="${f.id}"><span class="ti">${icon(f.icon)}</span><b>${esc(f.short)}</b><small>${esc(f.title)}</small></button>`).join('')}</div>`;
}
function bindPicker(root) { root.querySelectorAll('[data-new]').forEach(b => (b.onclick = () => { closeModal(); newJob(formById(b.dataset.new)); })); }
async function renderHome() {
  top('GasPad', 'Gas certificates · works offline'); document.querySelector('#selbar')?.remove(); document.body.classList.remove('inform');
  const jobs = (await db.allJobs()).sort((a, b) => b.updated - a.updated);
  const dueSoon = jobs.filter(j => { const d = j.data?.issue?.nextDue; return d && d >= isoDate(new Date()) && d <= isoDate(new Date(Date.now() + 30 * 864e5)); }).length;
  main.innerHTML = `<section class="hero"><div><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}${settings.engineer?.name ? ', ' + esc(settings.engineer.name.split(' ')[0]) : ''}</h1>
      <p>${jobs.length} saved · ${jobs.filter(j => j.status !== 'issued').length} drafts${dueSoon ? ` · <b>${dueSoon} due within 30 days</b>` : ''}</p></div><span class="heromark">${MARK}</span></section>
    <section class="card"><h2>New certificate</h2>${pickerHtml()}</section>
    <section class="card"><div class="apph"><h2>Saved certificates <span class="count">${jobs.length}</span></h2>${jobs.length ? '<button class="btn sm ghost" id="selBtn">Select</button>' : ''}</div>
    <input class="search" id="q" type="search" placeholder="Search address, name, ref…">
    <div class="chips" id="chips"><button class="chip on" data-k="">All</button>${FORMS.map(f => `<button class="chip" data-k="${f.id}">${esc(f.short)}</button>`).join('')}</div>
    <label class="chk" id="selAllRow" hidden><input type="checkbox" id="selAll"> <span id="selAllTxt">Select all</span></label>
    <div id="list"></div>${jobs.length ? '' : '<div class="empty">Nothing saved yet – pick a certificate above to start.</div>'}</section>
    <p class="muted center">GasPad v${APP_VERSION} · data stays on this phone · <a href="#/settings">Settings & backup</a></p>`;
  bindPicker(main);
  let selMode = false, q = '', kind = ''; const sel = new Set();
  const shown = () => jobs.filter(j => (!kind || j.kind === kind) && (!q || JSON.stringify([j.reportNo, j.data?.property, j.data?.landlord, j.data?.customer, j.data?.resp]).toLowerCase().includes(q)));
  const draw = () => { const list = shown(); $('#list').innerHTML = list.map(j => {
    const f = formById(j.kind) || { short: j.kind, id: j.kind }; const due = j.data?.issue?.nextDue; const over = due && due < isoDate(new Date());
    const unsafe = (j.data?.appliances || []).some(a => a.safe === 'No') || j.data?.t?.result === 'Fail' || j.kind === 'warning';
    return `<a class="job ${selMode ? 'selmode' : ''} ${sel.has(j.id) ? 'picked' : ''}" href="#/job/${j.id}" data-id="${j.id}">${selMode ? `<input type="checkbox" class="jsel" tabindex="-1" ${sel.has(j.id) ? 'checked' : ''}>` : ''}<div class="jb">
      <div class="meta">${pill(f)}<span class="badge ${j.status === 'issued' ? 'issued' : 'draft'}">${j.status === 'issued' ? 'Issued' : 'Draft'}</span></div>
      <div class="jt">${esc(f.summary?.(j.data) || '(no address yet)')}</div>
      <div class="meta"><span><b>${esc(j.reportNo)}</b> · ${ukDate(j.data?.issue?.date)}${unsafe && j.kind !== 'warning' ? ' · <b class="bad">unsafe</b>' : ''}</span><span class="${over ? 'bad' : ''}">${due ? `Due ${ukDate(due)}` : ''}</span></div></div></a>`; }).join('')
      || (jobs.length ? '<div class="empty">No matches</div>' : '');
    $('#selAllRow').hidden = !selMode; $('#selAllTxt').textContent = `Select all${q || kind ? ' (filtered)' : ''} – ${list.length}`;
    $('#selAll').checked = list.length > 0 && list.every(j => sel.has(j.id));
    if ($('#selBtn')) $('#selBtn').textContent = selMode ? 'Done' : 'Select';
    bar(); };
  const bar = () => { let b = $('#selbar');
    if (!selMode) return b?.remove();
    if (!b) { b = document.createElement('div'); b.id = 'selbar'; b.className = 'selbar'; document.body.append(b); }
    b.innerHTML = `<span><b>${sel.size}</b> selected</span><button class="btn" id="selCancel">Cancel</button><button class="btn delbtn" id="selDel" ${sel.size ? '' : 'disabled'}>Delete ${sel.size}</button>`;
    $('#selCancel').onclick = () => setMode(false); $('#selDel').onclick = confirmDel; };
  const setMode = on => { selMode = on; if (!on) sel.clear(); draw(); };
  const toggle = id => { sel.has(id) ? sel.delete(id) : sel.add(id); draw(); };
  const confirmDel = () => { const ids = [...sel]; const issued = jobs.filter(j => sel.has(j.id) && j.status === 'issued').length; const n = ids.length;
    modal(`<h2>Delete ${n} certificate${n > 1 ? 's' : ''}?</h2><p>This can’t be undone unless you have a backup.</p>${issued ? `<p class="warnp">⚠ ${n === 1 ? 'This certificate has' : issued === n ? `All ${n} have` : `${issued} of these ${issued === 1 ? 'has' : 'have'}`} been issued – make sure you’ve kept the PDF${issued > 1 ? 's' : ''}.</p>` : ''}
      <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn delbtn" id="delOk">Delete ${n}</button></div>`);
    $('#delOk').onclick = async () => { for (const id of ids) await db.deleteJob(id); closeModal(); document.querySelector('#selbar')?.remove(); toast(`Deleted ${n} certificate${n > 1 ? 's' : ''}`); renderHome(); }; };
  draw(); $('#q').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $('#chips').querySelectorAll('.chip').forEach(c => (c.onclick = () => { kind = c.dataset.k; $('#chips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); draw(); }));
  $('#selBtn') && ($('#selBtn').onclick = () => setMode(!selMode));
  $('#selAll').onchange = e => { shown().forEach(j => (e.target.checked ? sel.add(j.id) : sel.delete(j.id))); draw(); };
  let lp = null, lpFired = false;
  $('#list').addEventListener('click', e => { const a = e.target.closest('a[data-id]'); if (!a) return;
    if (lpFired) { lpFired = false; e.preventDefault(); return; } if (selMode) { e.preventDefault(); toggle(a.dataset.id); } });
  $('#list').addEventListener('pointerdown', e => { const a = e.target.closest('a[data-id]'); if (!a || selMode) return;
    const x = e.clientX, y = e.clientY; clearTimeout(lp); lpFired = false;
    lp = setTimeout(() => { lpFired = true; navigator.vibrate?.(30); selMode = true; sel.add(a.dataset.id); draw(); }, 550);
    const cancel = ev => { if (ev.type !== 'pointermove' || Math.hypot(ev.clientX - x, ev.clientY - y) > 10) { clearTimeout(lp); off(); } };
    const off = () => ['pointerup', 'pointercancel', 'pointermove'].forEach(t => removeEventListener(t, cancel)); ['pointerup', 'pointercancel', 'pointermove'].forEach(t => addEventListener(t, cancel)); });
  $('#list').addEventListener('contextmenu', e => { if (e.target.closest('a[data-id]')) e.preventDefault(); });
  fab(`${icon('plus')}<span>New</span>`, () => { modal(`<h2>New certificate</h2>${pickerHtml()}<div class="btns"><button class="btn" id="mclose">Cancel</button></div>`); bindPicker($('#modalBody')); });
}
function fab(html, fn) { const b = $('#fab'); if (!html) { b.hidden = true; return; } b.innerHTML = html; b.hidden = false; b.onclick = fn; }
async function newJob(f, data) {
  const jobs = await db.allJobs(); const a = allocateRef(settings, jobs, new Date(), f.code);
  settings.nextNumber = a.next; await saveSettings();
  const j = { id: uid(), kind: f.id, reportNo: a.ref, status: 'draft', created: Date.now(), updated: Date.now(), data: data || f.defaults(settings) };
  f.compute?.(j.data); await db.putJob(j); location.hash = `#/job/${j.id}/details`; return j;
}

// ---------- field rendering ----------
const isNeg = o => /^(No|Fail|Refused|ID)$/.test(o);
function fieldHtml(fd, val, path) {
  const id = 'f_' + path.replace(/\W/g, '_'); const lab = `<span>${esc(fd.l)}</span>`;
  if (fd.t === 'seg') return `<div class="f" data-seg="${path}">${lab}<div class="seg">${fd.opts.map(o => `<button type="button" data-v="${esc(o)}" class="${val === o ? 'on' : ''} ${isNeg(o) ? 'neg' : /^(Yes|Pass|Agreed)$/.test(o) ? 'pos' : ''}">${esc(o)}</button>`).join('')}</div></div>`;
  if (fd.t === 'calc') return `<div class="f calc">${lab}<output data-calc="${path}" class="${/^Fail/.test(val) ? 'bad' : /^Pass/.test(val) ? 'ok' : ''}">${esc(val) || '–'}</output></div>`;
  if (fd.t === 'area') return `<label class="f wide">${lab}<textarea data-p="${path}" id="${id}">${esc(val)}</textarea></label>`;
  if (fd.t === 'addr') return `<div class="f wide">${lab}<div class="pcrow"><input data-kind="postcode" placeholder="Postcode" id="${id}_pc" autocomplete="off"><button type="button" class="btn" data-pc="${path}">Find</button></div>
    <textarea data-p="${path}" id="${id}" placeholder="House / street&#10;Town&#10;Postcode">${esc(val)}</textarea></div>`;
  if (fd.t === 'list') return `<label class="f">${lab}<input data-p="${path}" id="${id}" list="dl_${id}" value="${esc(val)}"><datalist id="dl_${id}">${fd.opts.map(o => `<option value="${esc(o)}">`).join('')}</datalist></label>`;
  const type = fd.t === 'date' ? 'date' : fd.t === 'tel' ? 'tel' : fd.t === 'email' ? 'email' : 'text';
  const im = fd.t === 'num' ? 'decimal' : fd.im || '';
  return `<label class="f">${lab}<input data-p="${path}" id="${id}" type="${type}" ${im ? `inputmode="${im}"` : ''} ${fd.t === 'num' ? 'data-kind="number"' : ''} value="${esc(val)}" placeholder="${esc(fd.ph || '')}">${fd.hint ? `<small class="muted">${esc(fd.hint)}</small>` : ''}</label>`;
}
// paths: "landlord.name" (job.data) or "app.2.make" (row 2 of the form's repeating rows)
const curForm = () => formById(job.kind);
const rowsOf = () => (job.data[curForm().ROWS?.key || 'appliances'] ??= []);
function readPath(p) { const m = p.match(/^app\.(\d+)\.(\w+)$/); return m ? rowsOf()[+m[1]]?.[m[2]] : get(job.data, p); }
function writePath(p, v) {
  const f = curForm(); const m = p.match(/^app\.(\d+)\.(\w+)$/);
  if (m) { const a = rowsOf()[+m[1]]; a[m[2]] = v;
    for (const [co, co2, r] of f.ROWS?.ratios || []) { if ((m[2] === co || m[2] === co2) && (a[r + 'Auto'] || !a[r])) { a[r] = coRatio(a[co], a[co2]); a[r + 'Auto'] = true; const e = main.querySelector(`[data-p="app.${m[1]}.${r}"]`); if (e) e.value = a[r]; }
      if (m[2] === r) a[r + 'Auto'] = false; }
  } else { set(job.data, p, v);
    for (const [co, co2, r] of f.sectionRatios || []) { if ((p === co || p === co2) && (get(job.data, r + 'Auto') || !get(job.data, r))) { set(job.data, r, coRatio(get(job.data, co), get(job.data, co2))); set(job.data, r + 'Auto', true); const e = main.querySelector(`[data-p="${r}"]`); if (e) e.value = get(job.data, r); }
      if (p === r) set(job.data, r + 'Auto', false); }
    if (f.id === 'tightness' && p === 't.mpd') job.data.t.mpdAuto = false;
    if (f.nextDue && p === f.nextDue[0]) { const n = plus12m(v); set(job.data, f.nextDue[1], n); const e = main.querySelector(`[data-p="${f.nextDue[1]}"]`); if (e) e.value = n; } }
  if (f.compute) { f.compute(job.data); refreshComputed(); }
  if (job.status === 'issued') { job.status = 'draft'; toast('Edited after issue – back to draft. Re-issue when done.'); }
  scheduleSave();
}
function refreshComputed() {
  main.querySelectorAll('[data-calc]').forEach(o => { const v = readPath(o.dataset.calc) ?? ''; o.textContent = v || '–'; o.className = /^Fail/.test(v) ? 'bad' : /^Pass/.test(v) ? 'ok' : ''; });
  main.querySelectorAll('[data-p]').forEach(el => { if (el === document.activeElement) return; const v = readPath(el.dataset.p) ?? ''; if (el.value !== String(v)) el.value = v; });
}
function bindFields(root) {
  root.querySelectorAll('[data-p]').forEach(el => { el.oninput = () => writePath(el.dataset.p, el.value); el.addEventListener('focus', () => (lastField = el)); });
  root.querySelectorAll('[data-kind="postcode"]').forEach(el => el.addEventListener('focus', () => (lastField = el)));
  root.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => (b.onclick = () => {
    const was = b.classList.contains('on'); g.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    if (!was) b.classList.add('on'); writePath(g.dataset.seg, was ? '' : b.dataset.v); if (tab === 'sign') renderChecks();
    if (g.dataset.seg.endsWith('.safe')) renderJob(); })));
  root.querySelectorAll('[data-pc]').forEach(b => (b.onclick = () => findAddress(b.dataset.pc, b.previousElementSibling)));
}

// ---------- editor ----------
function renderJob() {
  const f = curForm(); top(job.reportNo, f.short + (job.status === 'issued' ? ' · issued' : ' · draft'), true); document.body.classList.add('inform');
  if (f.compute) f.compute(job.data);
  const T = f.TABS; if (!T.some(t => t.id === tab)) tab = T[0].id; const ti = T.findIndex(x => x.id === tab);
  $('#tabs').hidden = false; $('#tabs').innerHTML = T.map(t => `<a href="#/job/${job.id}/${t.id}" class="${t.id === tab ? 'on' : ''}">${icon(t.icon)}<span>${esc(t.label)}</span>${t.rows && !f.ROWS.max ? `<i class="n">${rowsOf().length}</i>` : ''}</a>`).join('');
  const t = T[ti]; let html = `<div class="stepper">${T.map((x, i) => `<span class="${i < ti ? 'done' : i === ti ? 'on' : ''}"></span>`).join('')}<small>Step ${ti + 1} of ${T.length} · ${esc(t.label)}</small></div>`;
  if (tab === 'details') html += `<div class="card ai"><div class="aih">${icon('cam')}<div><b>Photo import</b><p class="muted">Snap an old certificate or job sheet – Gemini fills empty fields for you to check.</p></div></div><div class="btns">${photoBtns('form')}</div></div>
    <div class="btns"><button class="btn ghost" id="copyFrom">${icon('copy')} Copy customer & property from another certificate</button>${f.party !== 'landlord' || true ? `<button class="btn ghost" id="copyAddr">Property = ${esc(f.SECTIONS.find(s => s.id === f.party).title.toLowerCase())} address</button>` : ''}</div>`;
  const secHtml = sid => { const s = f.SECTIONS.find(x => x.id === sid);
    return `<section class="card"><div class="apph"><h2>${esc(s.title)}</h2><button class="btn sm speak" data-speak="${sid}">${icon('mic')} Dictate</button></div><div class="grid2">${s.fields.map(fd => fieldHtml(fd, get(job.data, fd.k) ?? '', fd.k)).join('')}</div></section>`; };
  if (t.rows) { html += (t.sections || []).map(secHtml).join('') + rowsHtml(f); }
  else html += (t.sections || []).map(secHtml).join('');
  if (tab === 'sign') html += signHtml();
  main.innerHTML = html; bindFields(main);
  main.querySelectorAll('[data-speak]').forEach(b => (b.onclick = () => { const s = f.SECTIONS.find(x => x.id === b.dataset.speak); speakSection(s.title, s.fields.map(fd => ({ ...fd }))); }));
  if (tab === 'details') { bindPhoto('form', importWholeForm); $('#copyFrom').onclick = copyFromCert;
    $('#copyAddr') && ($('#copyAddr').onclick = () => { const src = f.party === 'landlord' ? 'property.address' : `${f.party}.address`, dst = f.party === 'landlord' ? 'landlord.address' : 'property.address';
      const a = get(job.data, src); if (!a) return toast('Enter the address first'); writePath(dst, a); main.querySelector(`[data-p="${dst}"]`).value = a; toast('Address copied'); }); }
  if (t.rows) bindRows(f);
  if (tab === 'sign') bindSign();
  const next = T[ti + 1]; fab(next ? `<span>Next: ${esc(next.label)}</span>${icon('next')}` : '', () => (location.hash = `#/job/${job.id}/${next.id}`));
}
const photoBtns = id => `<button class="btn pri" data-cam="${id}">${icon('cam')} Camera</button><button class="btn" data-gal="${id}">Gallery</button>
  <input type="file" accept="image/*" capture="environment" hidden data-camf="${id}"><input type="file" accept="image/*,application/pdf" hidden data-galf="${id}">`;
function bindPhoto(id, fn) {
  const cam = main.querySelector(`[data-camf="${id}"]`), gal = main.querySelector(`[data-galf="${id}"]`);
  main.querySelector(`[data-cam="${id}"]`).onclick = () => cam.click(); main.querySelector(`[data-gal="${id}"]`).onclick = () => gal.click();
  for (const inp of [cam, gal]) inp.onchange = async () => { const file = inp.files[0]; inp.value = ''; if (file) fn(await fileToDataUrl(file)); };
}
async function fileToDataUrl(file, max = 1800) {
  if (file.type === 'application/pdf') return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
function aiBusy(title) {
  const ctl = new AbortController();
  modal(`<h2>${esc(title)}</h2><p id="aist" class="muted">Sending photo…</p><div class="spin"></div><div class="btns"><button class="btn" id="aicancel">Cancel</button></div>`);
  $('#aicancel').onclick = () => { ctl.abort(); closeModal(); };
  return { signal: ctl.signal, onStatus: s => { const e = $('#aist'); if (e) e.textContent = s; }, model: settings.aiModel || undefined };
}
function aiFail(e) {
  modal(`<h2>Couldn’t read the photo</h2><p>${esc(e.message)}</p>${e.code === 'nokey' ? `<p><a class="btn pri" href="#/settings" id="gos">Open Settings</a></p>` : ''}
    ${e.detail ? `<details><summary class="muted">Technical detail</summary><pre class="pre">${esc(e.detail)}</pre></details>` : ''}<div class="btns"><button class="btn" id="mclose">Close</button></div>`);
  $('#gos') && ($('#gos').onclick = closeModal);
}
async function copyFromCert() {
  const f = curForm(); const jobs = (await db.allJobs()).filter(j => j.id !== job.id).sort((a, b) => b.updated - a.updated).slice(0, 40);
  if (!jobs.length) return toast('No other certificates saved yet');
  modal(`<h2>Copy from…</h2><p class="muted">Copies the ${esc(f.SECTIONS.find(s => s.id === f.party).title.toLowerCase())} and property address into empty boxes.</p><div class="picks">${jobs.map(j => { const sf = formById(j.kind);
    return `<button class="btn pickjob" data-j="${j.id}">${sf ? pill(sf) : ''}<span>${esc(sf?.summary?.(j.data) || j.reportNo)}</span><small>${esc(j.reportNo)}</small></button>`; }).join('')}</div><div class="btns"><button class="btn" id="mclose">Cancel</button></div>`);
  $('#modalBody').querySelectorAll('[data-j]').forEach(b => (b.onclick = () => { const src = jobs.find(j => j.id === b.dataset.j); const sf = formById(src.kind);
    const from = src.data[sf.party] || {}, to = (job.data[f.party] ??= {}); let n = 0;
    for (const k of ['name', 'company', 'address', 'phone', 'email']) if (from[k] && !to[k] && f.SECTIONS.find(s => s.id === f.party).fields.some(x => x.k === `${f.party}.${k}`)) { to[k] = from[k]; n++; }
    const pa = src.data.property?.address || from.address; if (pa && !get(job.data, 'property.address')) { set(job.data, 'property.address', pa); n++; }
    if (src.data.property?.tenant && f.id === 'cp12' && !get(job.data, 'property.tenant')) { set(job.data, 'property.tenant', src.data.property.tenant); n++; }
    closeModal(); scheduleSave(); renderJob(); toast(`Copied ${n} detail${n === 1 ? '' : 's'} from ${src.reportNo}`); }));
}

// ---------- repeating rows (appliances / boiler / pipe runs) ----------
function rowsHtml(f) {
  const R = f.ROWS; const rows = rowsOf(); if (!rows.length && R.max) rows.push(R.newRow());
  return rows.map((a, i) => `<section class="card app ${a.safe === 'No' ? 'unsafe' : ''}" data-i="${i}">
    <div class="apph"><h2>${esc(R.title)}${R.max === 1 ? '' : ' ' + (i + 1)}${a.location || a.type || a.size ? ` <small>${esc([a.location, a.type || a.size].filter(Boolean).join(' · '))}</small>` : ''}</h2>
      ${R.max === 1 ? '' : `<button class="btn ghost sm" data-del="${i}" aria-label="Remove">✕</button>`}</div>
    <div class="btns rowtools"><button class="btn speak" data-speakapp="${i}">${icon('mic')} Dictate</button>${R.badge ? `<button class="btn" data-badge="${i}">${icon('tag')} Scan data badge</button>` : ''}</div>
    ${R.badge ? `<input type="file" accept="image/*" capture="environment" hidden data-bcam="${i}"><input type="file" accept="image/*" hidden data-bgal="${i}">` : ''}
    ${R.warn && a.safe === 'No' ? `<div class="unsafebar">${icon('warn')}<span>Unsafe – issue a warning notice</span><button class="btn delbtn sm" data-wn="${i}">Create warning notice</button></div>` : ''}
    <div class="grid2">${R.fields.map(fd => fieldHtml(fd, a[fd.k] ?? '', `app.${i}.${fd.k}`)).join('')}</div></section>`).join('')
    + (R.max && rows.length >= R.max ? '' : `<button class="btn big pri" id="addApp">${esc(R.add || '＋ Add')}</button>`);
}
function bindRows(f) {
  const R = f.ROWS;
  $('#addApp') && ($('#addApp').onclick = () => { rowsOf().push(R.newRow()); scheduleSave(); renderJob(); setTimeout(() => [...main.querySelectorAll('.app')].pop()?.scrollIntoView({ behavior: 'smooth' }), 50); });
  main.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => { const i = +b.dataset.del; const old = rowsOf()[i];
    rowsOf().splice(i, 1); f.compute?.(job.data); scheduleSave(); renderJob(); toast(`${R.title} removed`, 6000, { label: 'Undo', fn: () => { rowsOf().splice(i, 0, old); f.compute?.(job.data); scheduleSave(); renderJob(); } }); }));
  main.querySelectorAll('[data-badge]').forEach(b => { const i = +b.dataset.badge; const cam = main.querySelector(`[data-bcam="${i}"]`), gal = main.querySelector(`[data-bgal="${i}"]`);
    b.onclick = () => { modal(`<h2>Scan data badge</h2><p class="muted">Photograph the appliance data plate straight on, without glare.</p><div class="btns"><button class="btn pri" id="bc">${icon('cam')} Camera</button><button class="btn" id="bg">Gallery</button><button class="btn" id="mclose">Cancel</button></div>`);
      $('#bc').onclick = () => { closeModal(); cam.click(); }; $('#bg').onclick = () => { closeModal(); gal.click(); }; };
    for (const inp of [cam, gal]) inp.onchange = async () => { const file = inp.files[0]; inp.value = ''; if (file) scanBadgeFor(i, await fileToDataUrl(file)); }; });
  main.querySelectorAll('[data-speakapp]').forEach(b => (b.onclick = () => { const i = +b.dataset.speakapp;
    speakSection(`${R.title}${R.max === 1 ? '' : ' ' + (i + 1)}`, R.fields.map(fd => ({ ...fd, k: `app.${i}.${fd.k}` }))); }));
  main.querySelectorAll('[data-wn]').forEach(b => (b.onclick = () => createWarning(+b.dataset.wn)));
}
async function createWarning(i) {
  await saveNow(); const W = formById('warning'); const src = job; const fsrc = curForm();
  const j = await newJob(W, W.fromUnsafe(src, fsrc, i, settings));
  // record on the source certificate
  if (fsrc.id === 'cp12') { set(src.data, 'defects.warningIssued', 'Yes'); set(src.data, 'defects.warningRef', j.reportNo); }
  if (fsrc.id === 'service') set(src.data, 'work.warning', 'Yes');
  src.updated = Date.now(); await db.putJob(src); toast(`Warning notice ${j.reportNo} started – ${src.reportNo} updated`, 6000);
}
async function scanBadgeFor(i, url) {
  const deps = aiBusy('Reading data badge…'); let r;
  try { r = await scanBadge(url, deps); } catch (e) { if (e.code === 'cancel') return; return aiFail(e); }
  const keys = new Set(curForm().ROWS.fields.map(x => x.k));
  const app = rowsOf()[i]; const rows = badgePlan(app, r.values).filter(x => keys.has(x.k));
  if (!rows.length) return aiFail(new AiError('empty', 'Nothing readable on that badge. Try closer, straight on, without glare.'));
  modal(`<h2>Check badge details</h2><p class="muted">${esc(curForm().ROWS.title)} ${i + 1}. Edit anything wrong, untick to skip. Read by ${esc(r.model)}.</p>
    ${rows.map((x, n) => `<div class="rev"><label class="chk"><input type="checkbox" data-on="${n}" ${x.on ? 'checked' : ''}> ${esc(BADGE_LABELS[x.k])}</label>
      <input data-val="${n}" value="${esc(x.val)}">${x.old && x.old !== x.val ? `<small class="muted">Currently: ${esc(x.old)} (will be replaced if ticked)</small>` : ''}</div>`).join('')}
    ${r.unreadable.length ? `<p class="warnp">Couldn’t read: ${r.unreadable.map(k => esc(BADGE_LABELS[k] || k)).join(', ')}</p>` : ''}${r.notes ? `<p class="muted">${esc(r.notes)}</p>` : ''}
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="bapply">✓ Apply</button></div>`);
  $('#bapply').onclick = () => { let n = 0; rows.forEach((x, k) => { if ($(`[data-on="${k}"]`).checked) { const v = $(`[data-val="${k}"]`).value.trim(); if (v) { app[x.k] = v; n++; } } });
    closeModal(); scheduleSave(); renderJob(); main.querySelector(`.app[data-i="${i}"]`)?.scrollIntoView(); toast(`Filled ${n} field${n === 1 ? '' : 's'} from badge`); };
}
async function importWholeForm(url) {
  const f = curForm(); const deps = aiBusy('Reading document…'); let r;
  try { r = normImport(await askGemini(url, importPrompt(f), deps).then(x => x.json), f); } catch (e) { if (e.code === 'cancel') return; return aiFail(e); }
  const flds = Object.fromEntries(f.SECTIONS.flatMap(s => s.fields.map(x => [x.k, { ...x, sec: s.title }])));
  const rows = r.fields.map(x => ({ p: x.k, label: `${flds[x.k].sec} – ${flds[x.k].l}`, val: x.val, old: get(job.data, x.k) || '' })).filter(x => x.old !== x.val).map(x => ({ ...x, on: !x.old }));
  const apps = r.rows || [];
  if (!rows.length && !apps.length) return aiFail(new AiError('empty', 'Nothing new could be read from that photo.'));
  modal(`<h2>Check imported details</h2><p class="muted">Ticked items fill in. Existing values are only replaced if you tick them.</p>
    ${rows.map((x, n) => `<div class="rev"><label class="chk"><input type="checkbox" data-on="${n}" ${x.on ? 'checked' : ''}> ${esc(x.label)}</label>
      ${x.val.includes('\n') ? `<textarea data-val="${n}">${esc(x.val)}</textarea>` : `<input data-val="${n}" value="${esc(x.val)}">`}${x.old ? `<small class="muted">Currently: ${esc(x.old)}</small>` : ''}</div>`).join('')}
    ${apps.length ? `<label class="chk"><input type="checkbox" id="impApps" checked> ${f.ROWS.max ? 'Fill' : 'Add'} ${apps.length} ${esc(f.ROWS.title.toLowerCase())}${apps.length > 1 ? 's' : ''}: ${esc(apps.map(a => [a.location, a.make, a.model, a.size].filter(Boolean).join(' ')).join('; '))}</label>` : ''}
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="fapply">✓ Apply</button></div>`);
  $('#fapply').onclick = () => { rows.forEach((x, n) => { if ($(`[data-on="${n}"]`).checked) set(job.data, x.p, $(`[data-val="${n}"]`).value.trim()); });
    if (apps.length && $('#impApps')?.checked) { const R = f.ROWS; const cur = rowsOf(); const blankKeys = Object.keys(R.newRow());
      if (R.max) Object.assign(cur[0] ??= R.newRow(), Object.fromEntries(Object.entries(apps[0]).filter(([k]) => !cur[0][k] || blankKeys.includes(k))));
      else { const keep = cur.filter(a => !Object.keys(a).every(k => blankKeys.includes(k))); job.data[R.key] = keep.concat(apps.map(a => ({ ...R.newRow(), ...a }))); } }
    if (f.nextDue && get(job.data, f.nextDue[0]) && !get(job.data, f.nextDue[1])) set(job.data, f.nextDue[1], plus12m(get(job.data, f.nextDue[0])));
    f.compute?.(job.data); closeModal(); scheduleSave(); renderJob(); toast('Imported – please check every field'); };
}

// ---------- address lookup ----------
async function findAddress(path, pcInput) {
  const pc = formatPostcode(pcInput.value) || pcInput.value.trim(); if (!pc) return toast('Enter a postcode');
  const provider = settings.addrProvider || ''; toast('Looking up ' + pc + '…');
  const r = await lookupPostcode(pc, { provider, key: provider ? getAddrKey(provider) : '' });
  if (!r.ok) return toast(r.error || 'Not found');
  const put = text => { writePath(path, text); main.querySelector(`[data-p="${CSS.escape(path)}"]`).value = text; closeModal(); };
  if (r.addresses.length) {
    modal(`<h2>Pick address – ${esc(r.postcode)}</h2>${r.error ? `<p class="warnp">${esc(r.error)}</p>` : ''}<div class="picks">${r.addresses.map((a, n) => `<button class="btn" data-a="${n}">${esc(a.label)}</button>`).join('')}</div><div class="btns"><button class="btn" id="mclose">Cancel</button></div>`);
    $('#modalBody').querySelectorAll('[data-a]').forEach(b => (b.onclick = () => put(formatAddress(r.addresses[+b.dataset.a]))));
  } else {
    modal(`<h2>${esc(r.postcode)}</h2><p class="muted">${esc([r.info?.town, r.info?.county].filter(Boolean).join(', ') || 'Postcode found')}${r.error ? ' · ' + esc(r.error) : ''}. Add the house number and street:</p>
      <input id="hs" placeholder="e.g. 12 Market Street"><div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="hsok">Use address</button></div>`);
    $('#hs').focus(); $('#hsok').onclick = () => put(formatAddress({ street: $('#hs').value.trim(), town: r.info?.town, county: r.info?.county, postcode: r.postcode }));
  }
}

// ---------- sign & issue ----------
function signHtml() {
  const f = curForm(); const s = job.data.sigs || {};
  return `<section class="card"><h2>Signatures</h2>${f.SIGS.map(({ k: w, l, refusable }) => `<div class="sigbox"><span>${esc(l)}</span>
    ${s[w] ? `<img src="${s[w]}" alt="signature">` : `<div class="sigempty">${s[w + 'Refused'] ? 'Refused to sign' : 'Not signed'}</div>`}<div class="btns"><button class="btn" data-sign="${w}">✍ ${s[w] ? 'Re-sign' : 'Sign'}</button>${s[w] ? `<button class="btn ghost" data-clr="${w}">Clear</button>` : ''}
    ${refusable && !s[w] ? `<label class="chk"><input type="checkbox" data-refused="${w}" ${s[w + 'Refused'] ? 'checked' : ''}> Refused to sign</label>` : ''}</div></div>`).join('')}
    ${settings.engineerSig && !s.engineer ? '<button class="btn" id="useSaved">Use my saved engineer signature</button>' : ''}</section>
    <section class="card"><h2>Checks before issue</h2><div id="checks"></div></section>
    <section class="card"><button class="btn big pri" id="issueBtn">${job.status === 'issued' ? '✓ Issued – re-issue' : 'Issue certificate'}</button>
    <div class="btns two"><button class="btn big" id="pdfBtn">${icon('doc')} Create PDF</button><button class="btn big" id="shareBtn" ${navigator.canShare ? '' : 'hidden'}>Share PDF</button></div>
    <label class="f"><span>Certificate ref</span><input id="refEdit" value="${esc(job.reportNo)}"></label>
    <button class="btn danger" id="delJob">Delete this certificate</button></section>`;
}
function renderChecks() {
  const issues = curForm().check(job.data);
  $('#checks').innerHTML = issues.length ? issues.map(x => `<a class="issue ${x.lvl === 'warn' ? 'warn' : ''}" href="#/job/${job.id}/${x.tab}"><b>${x.lvl === 'bad' ? '✕' : '!'}</b><span>${esc(x.msg)}</span></a>`).join('') : '<p class="okp">✓ All checks complete</p>';
  return issues;
}
function bindSign() {
  renderChecks();
  main.querySelectorAll('[data-sign]').forEach(b => (b.onclick = () => sigPad(b.dataset.sign)));
  main.querySelectorAll('[data-clr]').forEach(b => (b.onclick = () => { delete job.data.sigs[b.dataset.clr]; scheduleSave(); renderJob(); }));
  main.querySelectorAll('[data-refused]').forEach(c => (c.onchange = () => { job.data.sigs[c.dataset.refused + 'Refused'] = c.checked; scheduleSave(); renderJob(); }));
  $('#useSaved') && ($('#useSaved').onclick = () => { job.data.sigs.engineer = settings.engineerSig; scheduleSave(); renderJob(); });
  $('#issueBtn').onclick = async () => { const bad = renderChecks().filter(x => x.lvl === 'bad');
    if (bad.length) return toast(`Fix ${bad.length} item${bad.length > 1 ? 's' : ''} marked ✕ first`);
    job.status = 'issued'; job.issuedAt = Date.now(); await saveNow(); renderJob(); toast('Issued ✓ – create or share the PDF'); };
  $('#pdfBtn').onclick = () => makePdf('download'); $('#shareBtn').onclick = () => makePdf('share');
  $('#refEdit').onchange = async e => { const v = e.target.value.trim().toUpperCase(); const jobs = await db.allJobs();
    if (!v || isDuplicate(v, jobs, job.id)) { e.target.value = job.reportNo; return toast('That ref is empty or already used'); } job.reportNo = v; scheduleSave(); top(v, curForm().short, true); };
  $('#delJob').onclick = () => { modal(`<h2>Delete ${esc(job.reportNo)}?</h2><p>This can’t be undone (unless you have a backup).</p><div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn delbtn" id="dok">Delete</button></div>`);
    $('#dok').onclick = async () => { const id = job.id; job = null; await db.deleteJob(id); closeModal(); location.hash = '#/'; }; };
}
async function makePdf(mode) {
  if (job.status !== 'issued') toast('Draft PDF – issue the certificate when complete');
  const doc = buildPdf(job, settings); const name = pdfName(job);
  if (mode === 'share') { const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch {} return; } }
  doc.save(name);
}
function sigPad(who, onDone) {
  modal(`<h2>Sign – ${who === 'saved' ? 'save my signature' : esc((job && curForm().SIGS?.find(x => x.k === who)?.l) || who)}</h2><canvas id="sig" width="900" height="300"></canvas>
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn" id="sclr">Clear</button><button class="btn pri" id="sok">✓ Done</button></div>`);
  const c = $('#sig'), x = c.getContext('2d'); x.lineWidth = 4; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = '#0f172a'; let draw = false, inked = false;
  const pt = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.onpointerdown = e => { draw = true; c.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...pt(e)); };
  c.onpointermove = e => { if (!draw) return; x.lineTo(...pt(e)); x.stroke(); inked = true; };
  c.onpointerup = c.onpointercancel = () => (draw = false);
  $('#sclr').onclick = () => { x.clearRect(0, 0, c.width, c.height); inked = false; };
  $('#sok').onclick = () => { if (!inked) return toast('Please sign in the box'); const url = c.toDataURL('image/png'); closeModal();
    if (onDone) return onDone(url); (job.data.sigs ??= {})[who] = url; scheduleSave(); renderJob(); };
}

// ---------- voice dictation into the focused field ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const MIC_SEL = 'input:not([type]),input[type=text],input[type=tel],input[type=email],input[type=search],input[type=password]:not(#gk):not(#ak),textarea';
const fmic = $('#fieldMic'); let micEl = null;
function placeMic() { if (!micEl) return; const r = micEl.getBoundingClientRect(); const s = 40;
  fmic.style.left = (r.right + scrollX - s - 4) + 'px'; fmic.style.top = (r.top + scrollY + (micEl.tagName === 'TEXTAREA' ? 4 : (r.height - s) / 2)) + 'px'; }
document.addEventListener('focusin', e => { const el = e.target; if (!(el.matches?.(MIC_SEL)) || el.closest('dialog')) return; micEl = el; lastField = el; fmic.hidden = false; placeMic(); });
document.addEventListener('focusout', e => { if (e.target === micEl && e.relatedTarget !== fmic) { fmic.hidden = true; micEl = null; } });
addEventListener('resize', placeMic); document.addEventListener('input', placeMic); document.addEventListener('pointerup', placeMic);
fmic.addEventListener('pointerdown', e => e.preventDefault()); fmic.addEventListener('mousedown', e => e.preventDefault());
fmic.onclick = () => { const el = micEl; if (!el) return; fmic.hidden = true; micEl = null; dictate(el); };
function noVoice(el, blocked) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  modal(`<h2>🎤 Voice typing</h2><p>${blocked ? 'Voice typing isn’t available here right now.' : 'Voice typing isn’t supported in this browser.'} Use your keyboard’s mic instead, or try Chrome.</p>
    ${ios ? `<p class="muted">iPhone: tap the box, then the 🎤 on the keyboard (Settings → General → Keyboard → Enable Dictation).${standalone ? ' Voice typing often doesn’t work in home-screen apps on iPhone – opening GasPad in Safari may help.' : ''}</p>` : '<p class="muted">Android: tap the box, then the 🎤 on the keyboard (Gboard / Samsung keyboard).</p>'}
    <div class="btns"><button class="btn pri" id="nvok">OK – use keyboard</button></div>`);
  $('#nvok').onclick = () => { closeModal(); el?.focus(); };
}
function dictate(el) {
  const label = el.closest('.f')?.querySelector('span')?.textContent || 'field'; const kind = fieldKind(el);
  const fill = t => { const v = normaliseForField(kind, t); if (!v) return; el.value = el.tagName === 'TEXTAREA' && el.value ? el.value + (/\s$/.test(el.value) ? '' : ' ') + v : v;
    el.dispatchEvent(new Event('input')); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); toast(`${label}: ${v}`); };
  if (!SR) return noVoice(el);
  const rec = new SR(); rec.lang = 'en-GB'; rec.interimResults = true; rec.continuous = false; const dict = new Dictation(); let txt = '', done = false;
  modal(`<h2>🎤 ${esc(label)}</h2><div id="vlive" class="vlive">Listening…</div><div class="btns"><button class="btn" id="vc">Cancel</button><button class="btn pri" id="vs">Done</button></div>`);
  $('#vc').onclick = () => { done = true; try { rec.abort(); } catch {} closeModal(); }; $('#vs').onclick = () => { try { rec.stop(); } catch {} };
  rec.onresult = e => { txt = dict.onResults(e.results); $('#vlive') && ($('#vlive').textContent = txt); };
  rec.onerror = e => { if (done) return; done = true; closeModal();
    if (e.error === 'service-not-allowed' || e.error === 'language-not-supported') return noVoice(el, true);
    toast(e.error === 'not-allowed' ? 'Microphone blocked – allow the mic for this site in your browser settings' : e.error === 'network' ? 'Voice needs a connection – use your keyboard’s mic offline' : 'Didn’t catch that – try again'); };
  rec.onend = () => { if (done) return; done = true; closeModal(); txt = dict.endSession(); txt.trim() ? fill(txt.trim()) : toast('Didn’t catch that'); };
  try { rec.start(); } catch (e) { done = true; closeModal(); noVoice(el, true); }
};

// ---------- speak a whole section ----------
function speakSection(title, fields) {
  if (!SR) return typedSpeech(title, fields);
  document.querySelector('#spbar')?.remove();
  const bar = document.createElement('div'); bar.id = 'spbar'; bar.className = 'spbar';
  bar.innerHTML = `<span class="pdot"></span><span class="spl"><b>Listening… ${esc(title)}</b><small id="spl"></small></span><button class="btn" id="spx" aria-label="Cancel">✕</button><button class="btn pri" id="spstop">⏹ Stop</button>`;
  document.body.append(bar);
  let listening = true, cancelled = false, rec = null; const dict = new Dictation(); let text = '';
  const live = () => { const t = text.trim(); const el = $('#spl'); if (el) el.textContent = t ? '…' + t.slice(-70) : 'Say e.g. “make Worcester, flue type room sealed”'; };
  // Fresh recogniser per session; Android uses one-utterance sessions (continuous mode repeats results there).
  const startSession = () => {
    rec = new SR(); rec.lang = 'en-GB'; rec.continuous = useContinuous(); rec.interimResults = true;
    rec.onresult = e => { text = dict.onResults(e.results); live(); };
    rec.onerror = e => { if (e.error === 'no-speech' || e.error === 'aborted') return; listening = false; bar.remove();
      if (e.error === 'not-allowed') return toast('Microphone blocked – allow it in browser settings', 6000);
      typedSpeech(title, fields, dict.endSession(), e.error === 'network' ? 'Voice needs a connection – use your keyboard’s mic below.' : 'Voice typing not available here – use your keyboard’s mic below.'); };
    rec.onend = () => { text = dict.endSession(); live(); if (listening) setTimeout(() => { if (!listening) return; try { startSession(); } catch { finish(); } }, 150); };
    rec.start();
  };
  const finish = () => { if (!bar.isConnected) return; listening = false; try { rec?.abort(); } catch {} text = dict.endSession(); bar.remove(); if (!cancelled) reviewSpeech(title, fields, text.trim()); };
  $('#spstop').onclick = finish; $('#spx').onclick = () => { cancelled = true; finish(); };
  live(); try { startSession(); } catch { bar.remove(); typedSpeech(title, fields, '', 'Couldn’t start the mic – use your keyboard’s mic below.'); }
}
function typedSpeech(title, fields, text = '', note = '') {
  modal(`<h2>🎙 ${esc(title)}</h2>${note ? `<p class="warnp">${esc(note)}</p>` : SR ? '' : '<p class="muted">Voice typing isn’t supported in this browser – tap the box and use your keyboard’s mic, or type.</p>'}
    <p class="muted">Say/type field names then values, e.g. “location kitchen, make Worcester, flue type room sealed, CO 12, safe to use yes”.</p>
    <label class="f"><span>What to fill in</span><textarea id="sptx" rows="4">${esc(text)}</textarea></label>
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="spgo">Check & fill →</button></div>`);
  setTimeout(() => $('#sptx')?.focus(), 50);
  $('#spgo').onclick = () => reviewSpeech(title, fields, $('#sptx').value.trim());
}
async function reviewSpeech(title, fields, transcript) {
  let rows = transcript ? parseSpeech(transcript, fields) : [], by = 'offline parser';
  if (!transcript) { /* nothing heard: still show the sheet so they can type */ } else if (getKey() && navigator.onLine && settings.speakAi !== false) {
    toast('Checking with Gemini…', 8000);
    try { const g = fromGemini(await askGeminiText(geminiPrompt(transcript, fields), { model: settings.aiModel || undefined, delayScale: 0.5 }), fields);
      if (g.length) { const ks = new Set(g.map(r => r.k)); rows = [...g, ...rows.filter(r => !ks.has(r.k))]; by = 'Gemini (+ offline parser)'; } }
    catch (e) { by = 'offline parser (Gemini unavailable)'; }
  }
  const order = fields.map(f => f.k); rows.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  const fmap = Object.fromEntries(fields.map(f => [f.k, f]));
  modal(`<h2>Check spoken details</h2><p class="muted">${esc(title)} · read by ${esc(by)}. Edit anything wrong, untick to skip.</p>
    <label class="f"><span>What you said (edit and tap Re-read if needed)</span><textarea id="sptx" rows="3">${esc(transcript)}</textarea></label>
    <div class="btns"><button class="btn" id="spre">↻ Re-read</button></div>
    ${rows.length ? '' : '<p class="warnp">No box names recognised – start each item with the box name, e.g. “make Worcester”.</p>'}
    ${rows.map((r, n) => { const f = fmap[r.k]; const old = readPath(r.k) || '';
      const input = f.t === 'seg' ? `<select data-val="${n}">${f.opts.map(o => `<option ${o === r.val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : f.t === 'area' || f.t === 'addr' ? `<textarea data-val="${n}">${esc(r.val)}</textarea>` : `<input data-val="${n}" value="${esc(r.val)}">`;
      return `<div class="rev"><label class="chk"><input type="checkbox" data-on="${n}" checked> ${esc(f.l)}</label>${input}${old && old !== r.val ? `<small class="muted">Currently: ${esc(old)} (will be replaced)</small>` : ''}</div>`; }).join('')}
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn" id="spagain">↺ Dictate again</button><button class="btn pri" id="spapply">✓ Apply</button></div>`);
  $('#spagain').onclick = () => { closeModal(); speakSection(title, fields); };
  $('#spre').onclick = () => reviewSpeech(title, fields, $('#sptx').value.trim());
  $('#spapply').onclick = () => { const undo = []; rows.forEach((r, n) => { if (!$(`[data-on="${n}"]`).checked) return; const v = $(`[data-val="${n}"]`).value.trim(); if (!v) return;
      undo.push([r.k, readPath(r.k)]); writePath(r.k, v); });
    closeModal(); const y = scrollY; renderJob(); scrollTo(0, y);
    toast(`Filled ${undo.length} box${undo.length === 1 ? '' : 'es'}`, 6000, { label: 'Undo', fn: () => { undo.reverse().forEach(([k, v]) => writePath(k, v ?? '')); renderJob(); } }); };
}

// ---------- settings, backup ----------
function renderSettings() {
  top('Settings', 'Saved on this phone', true); const e = settings.engineer || {}; const ef = formById('cp12').SECTIONS.find(s => s.id === 'engineer').fields;
  main.innerHTML = `<section class="card"><h2>My details (pre-fill new certificates)</h2>${ef.map(fd => fieldHtml(fd, e[fd.k.split('.')[1]] ?? '', 's.' + fd.k)).join('')}
    <div class="sigbox"><span>My saved signature</span>${settings.engineerSig ? `<img src="${settings.engineerSig}">` : '<div class="sigempty">None</div>'}<div class="btns"><button class="btn" id="ssig">✍ Draw</button>${settings.engineerSig ? '<button class="btn danger" id="csig">Clear</button>' : ''}</div></div>
    <div class="f"><span>Logo on PDF (optional)</span>${settings.logo ? `<img class="logo" src="${settings.logo}">` : ''}<div class="btns"><button class="btn" id="lgo">Choose image</button>${settings.logo ? '<button class="btn danger" id="lgc">Remove</button>' : ''}</div><input type="file" accept="image/*" id="lgf" hidden></div>
    <p class="muted">Don’t use the Gas Safe Register logo unless you’re authorised to – a plain reg no. is fine.</p></section>
    <section class="card"><h2>Certificate refs</h2><div class="row"><label class="f"><span>Prefix</span><input id="rp" value="${esc(settings.refPrefix)}"></label><label class="f"><span>Next number</span><input id="rn" inputmode="numeric" value="${esc(settings.nextNumber)}"></label></div><p class="muted">e.g. ${esc(cleanPrefix(settings.refPrefix) || 'GAS')}-CP12-${String(new Date().getFullYear()).slice(2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-0001. Numbers never repeat.</p></section>
    <section class="card"><h2>AI photo reading (Google Gemini)</h2><p class="muted">Uses <b>your own</b> free Gemini API key. Kept only on this phone – not in backups. Photos go straight from this phone to Google.</p>
      <label class="f"><span>Gemini API key</span><input id="gk" type="password" autocomplete="off" value="${esc(getKey())}" placeholder="AIza…"></label>
      <p><a href="${KEY_URL}" target="_blank" rel="noopener">Get a free key at Google AI Studio ↗</a></p>
      <label class="chk"><input type="checkbox" id="spai" ${settings.speakAi !== false ? 'checked' : ''}> Also use Gemini to understand “Dictate” (better accuracy; offline parser used when no signal)</label>
      <label class="f"><span>Model (blank = default with backups)</span><input id="gm" value="${esc(settings.aiModel || '')}" placeholder="gemini-3.8-flash"></label></section>
    <section class="card"><h2>Address lookup</h2><p class="muted">postcodes.io (free) checks the postcode and town. For house-by-house lists add a key:</p>
      <div class="seg" id="ap">${['', ...Object.keys(ADDR_PROVIDERS)].map(p => `<button data-v="${p}" class="${(settings.addrProvider || '') === p ? 'on' : ''}">${p ? ADDR_PROVIDERS[p].label : 'None (free)'}</button>`).join('')}</div>
      ${settings.addrProvider ? `<label class="f"><span>${ADDR_PROVIDERS[settings.addrProvider].label} key (this phone only)</span><input id="ak" type="password" value="${esc(getAddrKey(settings.addrProvider))}" placeholder="${ADDR_PROVIDERS[settings.addrProvider].keyHint}"></label><p><a target="_blank" rel="noopener" href="${ADDR_PROVIDERS[settings.addrProvider].signup}">Sign up ↗</a></p>` : ''}</section>
    <section class="card"><h2>Backup & restore</h2><p class="muted">Saves all certificates and settings (not API keys) to a JSON file. Keep it in Drive / email it to yourself.</p>
      <div class="btns"><button class="btn pri" id="bk">⬇ Backup</button><button class="btn" id="rs">⬆ Restore</button><input type="file" id="rsf" accept="application/json,.json" hidden></div></section>
    <p class="muted center">GasPad v${APP_VERSION}</p>`;
  main.querySelectorAll('[data-p]').forEach(el => (el.oninput = () => { (settings.engineer ??= {})[el.dataset.p.split('.').pop()] = el.value; saveSettings(); }));
  main.querySelectorAll('[data-pc]').forEach(b => (b.onclick = async () => { const r = await lookupPostcode(b.previousElementSibling.value); if (!r.ok) return toast(r.error);
    const t = main.querySelector('[data-p="s.engineer.address"]'); t.value = formatAddress({ town: r.info?.town, county: r.info?.county, postcode: r.postcode }); t.dispatchEvent(new Event('input')); }));
  $('#ssig').onclick = () => sigPad('saved', url => { settings.engineerSig = url; saveSettings(); renderSettings(); });
  $('#csig') && ($('#csig').onclick = () => { delete settings.engineerSig; saveSettings(); renderSettings(); });
  $('#lgo').onclick = () => $('#lgf').click(); $('#lgf').onchange = async e => { const f = e.target.files[0]; if (!f) return; settings.logo = await fileToDataUrl(f, 600); saveSettings(); renderSettings(); };
  $('#lgc') && ($('#lgc').onclick = () => { delete settings.logo; saveSettings(); renderSettings(); });
  $('#rp').onchange = e => { settings.refPrefix = cleanPrefix(e.target.value) || 'GAS'; saveSettings(); renderSettings(); };
  $('#rn').onchange = e => { settings.nextNumber = Math.max(1, parseInt(e.target.value) || 1); saveSettings(); };
  $('#gk').onchange = e => { setKey(e.target.value); toast('Key saved on this phone'); };
  $('#spai').onchange = e => { settings.speakAi = e.target.checked; saveSettings(); };
  $('#gm').onchange = e => { settings.aiModel = e.target.value.trim(); saveSettings(); };
  $('#ap').querySelectorAll('button').forEach(b => (b.onclick = () => { settings.addrProvider = b.dataset.v; saveSettings(); renderSettings(); }));
  $('#ak') && ($('#ak').onchange = e => { setAddrKey(settings.addrProvider, e.target.value); toast('Key saved on this phone'); });
  $('#bk').onclick = async () => { const data = { app: 'gaspad', version: APP_VERSION, exported: new Date().toISOString(), settings, jobs: await db.allJobs() };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = `gaspad-backup-${isoDate(new Date())}.json`; a.click(); };
  $('#rs').onclick = () => $('#rsf').click();
  $('#rsf').onchange = async e => { const f = e.target.files[0]; if (!f) return; let d; try { d = JSON.parse(await f.text()); } catch { return toast('Not a valid backup file'); }
    if (d.app !== 'gaspad' || !Array.isArray(d.jobs)) return toast('Not a GasPad backup');
    const plan = planRestore(settings, await db.allJobs(), d.jobs);
    for (const j of plan.jobs) await db.putJob(j);
    settings = { ...d.settings, ...settings, nextNumber: plan.nextNumber }; await saveSettings();
    toast(`Restored ${plan.jobs.length} certificate(s)${plan.renamed.length ? `, ${plan.renamed.length} renumbered` : ''}`); renderSettings(); };
}

function updateBanner() {
  if ($('#upd')) return; const b = document.createElement('button'); b.id = 'upd'; b.className = 'updbar';
  b.textContent = 'GasPad update available – tap to refresh'; b.onclick = async () => { await saveNow(); location.reload(); }; document.body.prepend(b);
}
// ---------- boot ----------
(async () => {
  const s = await db.getKV('settings'); if (s) settings = { ...settings, ...s };
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const had = !!navigator.serviceWorker.controller; let shown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had || shown) return; shown = true; updateBanner(); });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      const chk = () => reg.update().catch(() => {}); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && chk()); setInterval(chk, 30 * 60e3);
    }).catch(() => {});
  }
  route();
})();
