import { db } from './db.js';
import { FORMS, formById } from './forms.js';
import { get, set, plus12m, coRatio, newAppliance, isoDate } from './cp12.js';
import { allocateRef, planRestore, isDuplicate, cleanPrefix } from './refno.js';
import { lookupPostcode, formatAddress, ADDR_PROVIDERS, getAddrKey, setAddrKey } from './address.js';
import { fieldKind, normaliseForField, formatPostcode } from './fieldvoice.js';
import { getKey, setKey, KEY_URL, scanBadge, importForm, badgePlan, BADGE_LABELS, AiError } from './ai.js';
import { buildCp12Pdf, pdfName } from './pdf.js';

export const APP_VERSION = '1.0.3';
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
function top(title, sub = '', back = false) { $('#topTitle').textContent = title; $('#topSub').textContent = sub; $('#backBtn').hidden = !back; }

async function saveSettings() { await db.setKV('settings', settings); }
function scheduleSave() { $('#saveState').textContent = '…'; clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
async function saveNow() { if (!job) return; clearTimeout(saveT); job.updated = Date.now(); await db.putJob(job); $('#saveState').textContent = '✓ saved'; }

// ---------- router ----------
async function route() {
  if (job) await saveNow();
  const h = location.hash.replace(/^#\/?/, '').split('/');
  $('#tabs').hidden = true; scrollTo(0, 0);
  if (h[0] === 'job' && h[1]) { job = await db.getJob(h[1]); if (!job) return (location.hash = '#/'); tab = h[2] || 'details'; return renderJob(); }
  job = null;
  if (h[0] === 'settings') return renderSettings();
  return renderHome();
}
$('#backBtn').onclick = () => (location.hash = '#/');
$('#settingsBtn').onclick = () => (location.hash = '#/settings');
addEventListener('hashchange', route);

// ---------- home ----------
async function renderHome() {
  top('GasPad', 'Gas safety certificates – offline');
  const jobs = (await db.allJobs()).sort((a, b) => b.updated - a.updated);
  const tiles = FORMS.map(f => `<button class="tile ${f.active ? '' : 'soon'}" data-new="${f.id}" ${f.active ? '' : 'aria-disabled="true"'}>
    <span class="ti">${f.icon}</span><b>${esc(f.short)}</b><small>${f.active ? esc(f.title) : 'Coming soon'}</small></button>`).join('');
  main.innerHTML = `<section class="card"><h2>New certificate</h2><div class="tiles">${tiles}</div></section>
    <section class="card"><h2>Saved certificates (${jobs.length})</h2>
    <input class="search" id="q" type="search" placeholder="Search address, landlord, ref…">
    <div id="list"></div>${jobs.length ? '' : '<p class="muted">Nothing saved yet. Tap CP12 above to start.</p>'}</section>
    <p class="muted center">GasPad v${APP_VERSION} · data stays on this phone · <a href="#/settings">Settings & backup</a></p>`;
  const draw = q => { q = q.toLowerCase(); $('#list').innerHTML = jobs.filter(j => !q || JSON.stringify([j.reportNo, j.data?.property, j.data?.landlord]).toLowerCase().includes(q)).map(j => {
    const f = formById(j.kind) || { short: j.kind }; const due = j.data?.issue?.nextDue; const over = due && due < isoDate(new Date());
    const unsafe = (j.data?.appliances || []).some(a => a.safe === 'No');
    return `<a class="job card inner" href="#/job/${j.id}"><div class="meta"><span><b>${esc(j.reportNo)}</b> · ${esc(f.short)}</span>
      <span class="badge ${j.status === 'issued' ? 'issued' : 'draft'}">${j.status === 'issued' ? 'Issued' : 'Draft'}</span></div>
      <div>${esc(f.summary?.(j.data) || '(no address yet)')}</div>
      <div class="meta"><span>${ukDate(j.data?.issue?.date)}${unsafe ? ' · <b class="bad">unsafe appliance</b>' : ''}</span><span class="${over ? 'bad' : ''}">${due ? `Next due ${ukDate(due)}` : ''}</span></div></a>`; }).join(''); };
  draw(''); $('#q').oninput = e => draw(e.target.value);
  main.querySelectorAll('[data-new]').forEach(b => (b.onclick = () => { const f = formById(b.dataset.new); if (!f.active) return toast(`${f.title} is coming soon`); newJob(f); }));
}
async function newJob(f) {
  const jobs = await db.allJobs(); const a = allocateRef(settings, jobs, new Date(), f.code);
  settings.nextNumber = a.next; await saveSettings();
  const j = { id: uid(), kind: f.id, reportNo: a.ref, status: 'draft', created: Date.now(), updated: Date.now(), data: f.defaults(settings) };
  await db.putJob(j); location.hash = `#/job/${j.id}/details`;
}

// ---------- field rendering ----------
function fieldHtml(fd, val, path) {
  const id = 'f_' + path.replace(/\W/g, '_'); const lab = `<span>${esc(fd.l)}</span>`;
  if (fd.t === 'seg') return `<div class="f" data-seg="${path}">${lab}<div class="seg">${fd.opts.map(o => `<button type="button" data-v="${esc(o)}" class="${val === o ? 'on' : ''} ${/^(No|Fail)$/.test(o) ? 'neg' : ''}">${esc(o)}</button>`).join('')}</div></div>`;
  if (fd.t === 'area') return `<label class="f">${lab}<textarea data-p="${path}" id="${id}">${esc(val)}</textarea></label>`;
  if (fd.t === 'addr') return `<div class="f">${lab}<div class="pcrow"><input data-kind="postcode" placeholder="Postcode" id="${id}_pc" autocomplete="off"><button type="button" class="btn" data-pc="${path}">Find</button></div>
    <textarea data-p="${path}" id="${id}" placeholder="House / street&#10;Town&#10;Postcode">${esc(val)}</textarea></div>`;
  if (fd.t === 'list') return `<label class="f">${lab}<input data-p="${path}" id="${id}" list="dl_${id}" value="${esc(val)}"><datalist id="dl_${id}">${fd.opts.map(o => `<option value="${esc(o)}">`).join('')}</datalist></label>`;
  const type = fd.t === 'date' ? 'date' : fd.t === 'tel' ? 'tel' : fd.t === 'email' ? 'email' : 'text';
  const im = fd.t === 'num' ? 'decimal' : fd.im || '';
  return `<label class="f">${lab}<input data-p="${path}" id="${id}" type="${type}" ${im ? `inputmode="${im}"` : ''} ${fd.t === 'num' ? 'data-kind="number"' : ''} value="${esc(val)}" placeholder="${esc(fd.ph || '')}">${fd.hint ? `<small class="muted">${esc(fd.hint)}</small>` : ''}</label>`;
}
// paths: "landlord.name" (job.data) or "app.2.make" (appliance)
function readPath(p) { const m = p.match(/^app\.(\d+)\.(\w+)$/); return m ? job.data.appliances[+m[1]]?.[m[2]] : get(job.data, p); }
function writePath(p, v) {
  const m = p.match(/^app\.(\d+)\.(\w+)$/);
  if (m) { const a = job.data.appliances[+m[1]]; a[m[2]] = v;
    if ((m[2] === 'co' || m[2] === 'co2') && (a.ratioAuto || !a.ratio)) { a.ratio = coRatio(a.co, a.co2); a.ratioAuto = true; const r = main.querySelector(`[data-p="app.${m[1]}.ratio"]`); if (r) r.value = a.ratio; }
    if (m[2] === 'ratio') a.ratioAuto = false;
  } else { set(job.data, p, v);
    if (p === 'issue.date') { const n = plus12m(v); set(job.data, 'issue.nextDue', n); const e = main.querySelector('[data-p="issue.nextDue"]'); if (e) e.value = n; } }
  if (job.status === 'issued') { job.status = 'draft'; toast('Edited after issue – back to draft. Re-issue when done.'); }
  scheduleSave();
}
function bindFields(root) {
  root.querySelectorAll('[data-p]').forEach(el => { el.oninput = () => writePath(el.dataset.p, el.value); el.addEventListener('focus', () => (lastField = el)); });
  root.querySelectorAll('[data-kind="postcode"]').forEach(el => el.addEventListener('focus', () => (lastField = el)));
  root.querySelectorAll('[data-seg]').forEach(g => g.querySelectorAll('button').forEach(b => (b.onclick = () => {
    const was = b.classList.contains('on'); g.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    if (!was) b.classList.add('on'); writePath(g.dataset.seg, was ? '' : b.dataset.v); if (tab === 'sign') renderChecks(); })));
  root.querySelectorAll('[data-pc]').forEach(b => (b.onclick = () => findAddress(b.dataset.pc, b.previousElementSibling)));
}

// ---------- editor ----------
function renderJob() {
  const f = formById(job.kind); top(job.reportNo, f.short + (job.status === 'issued' ? ' · issued' : ' · draft'), true);
  const T = f.TABS; if (!T.some(t => t.id === tab)) tab = T[0].id;
  $('#tabs').hidden = false; $('#tabs').innerHTML = T.map(t => `<a href="#/job/${job.id}/${t.id}" class="${t.id === tab ? 'on' : ''}">${esc(t.label)}${t.id === 'appliances' ? ` <span class="dot n">${job.data.appliances.length}</span>` : ''}</a>`).join('');
  const t = T.find(x => x.id === tab); let html = '';
  if (tab === 'details') html += `<div class="card ai"><b>📄 Photo import</b><p class="muted">Snap an old CP12 or job sheet – Gemini fills empty fields for you to check.</p><div class="btns">${photoBtns('form')}</div></div>`;
  if (tab === 'details') html += `<div class="btns"><button class="btn" id="copyAddr">Landlord address = property address</button></div>`;
  if (tab === 'appliances') html += appliancesHtml(f);
  for (const sid of t.sections || []) { const s = f.SECTIONS.find(x => x.id === sid);
    html += `<section class="card"><h2>${esc(s.title)}</h2>${s.fields.map(fd => fieldHtml(fd, get(job.data, fd.k) ?? '', fd.k)).join('')}</section>`; }
  if (tab === 'sign') html += signHtml();
  main.innerHTML = html; bindFields(main);
  if (tab === 'details') { bindPhoto('form', importWholeForm); $('#copyAddr').onclick = () => { const a = get(job.data, 'property.address'); if (!a) return toast('Enter the property address first');
    writePath('landlord.address', a); main.querySelector('[data-p="landlord.address"]').value = a; }; }
  if (tab === 'appliances') bindAppliances();
  if (tab === 'sign') bindSign();
}
const photoBtns = id => `<button class="btn pri" data-cam="${id}">📷 Camera</button><button class="btn" data-gal="${id}">🖼 Gallery</button>
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

// ---------- appliances ----------
function appliancesHtml(f) {
  return job.data.appliances.map((a, i) => `<section class="card app ${a.safe === 'No' ? 'unsafe' : ''}" data-i="${i}">
    <div class="apph"><h2>Appliance ${i + 1}${a.location || a.type ? ` – ${esc([a.location, a.type].filter(Boolean).join(', '))}` : ''}</h2>
      <button class="btn danger sm" data-del="${i}" aria-label="Remove">✕</button></div>
    <div class="scan"><b>🏷 Scan data badge</b><div class="btns">${photoBtns('b' + i)}</div></div>
    <div class="grid2">${f.APPLIANCE_FIELDS.map(fd => fieldHtml(fd, a[fd.k] ?? '', `app.${i}.${fd.k}`)).join('')}</div></section>`).join('')
    + `<button class="btn big pri" id="addApp">＋ Add appliance</button>`;
}
function bindAppliances() {
  $('#addApp').onclick = () => { job.data.appliances.push(newAppliance()); scheduleSave(); renderJob(); setTimeout(() => main.querySelector('.app:last-of-type')?.scrollIntoView({ behavior: 'smooth' }), 50); };
  main.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => { const i = +b.dataset.del; const old = job.data.appliances[i];
    job.data.appliances.splice(i, 1); scheduleSave(); renderJob(); toast('Appliance removed', 6000, { label: 'Undo', fn: () => { job.data.appliances.splice(i, 0, old); scheduleSave(); renderJob(); } }); }));
  job.data.appliances.forEach((a, i) => bindPhoto('b' + i, url => scanBadgeFor(i, url)));
}
async function scanBadgeFor(i, url) {
  const deps = aiBusy('Reading data badge…'); let r;
  try { r = await scanBadge(url, deps); } catch (e) { if (e.code === 'cancel') return; return aiFail(e); }
  const app = job.data.appliances[i]; const rows = badgePlan(app, r.values);
  if (!rows.length) return aiFail(new AiError('empty', 'Nothing readable on that badge. Try closer, straight on, without glare.'));
  modal(`<h2>Check badge details</h2><p class="muted">Appliance ${i + 1}. Edit anything wrong, untick to skip. Read by ${esc(r.model)}.</p>
    ${rows.map((x, n) => `<div class="rev"><label class="chk"><input type="checkbox" data-on="${n}" ${x.on ? 'checked' : ''}> ${esc(BADGE_LABELS[x.k])}</label>
      <input data-val="${n}" value="${esc(x.val)}">${x.old && x.old !== x.val ? `<small class="muted">Currently: ${esc(x.old)} (will be replaced if ticked)</small>` : ''}</div>`).join('')}
    ${r.unreadable.length ? `<p class="warnp">Couldn’t read: ${r.unreadable.map(k => esc(BADGE_LABELS[k] || k)).join(', ')}</p>` : ''}${r.notes ? `<p class="muted">${esc(r.notes)}</p>` : ''}
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="bapply">✓ Apply</button></div>`);
  $('#bapply').onclick = () => { let n = 0; rows.forEach((x, k) => { if ($(`[data-on="${k}"]`).checked) { const v = $(`[data-val="${k}"]`).value.trim(); if (v) { app[x.k] = v; n++; } } });
    closeModal(); scheduleSave(); renderJob(); main.querySelector(`.app[data-i="${i}"]`)?.scrollIntoView(); toast(`Filled ${n} field${n === 1 ? '' : 's'} from badge`); };
}
async function importWholeForm(url) {
  const deps = aiBusy('Reading document…'); let r;
  try { r = await importForm(url, deps); } catch (e) { if (e.code === 'cancel') return; return aiFail(e); }
  const rows = [];
  for (const sec of ['landlord', 'property', 'engineer', 'install', 'defects']) for (const [k, v] of Object.entries(r[sec] || {})) { const p = `${sec}.${k}`; const old = get(job.data, p) || '';
    if (old !== v) rows.push({ p, label: `${sec[0].toUpperCase() + sec.slice(1)} – ${k}`, val: v, old, on: !old }); }
  const apps = r.appliances || [];
  if (!rows.length && !apps.length) return aiFail(new AiError('empty', 'Nothing new could be read from that photo.'));
  modal(`<h2>Check imported details</h2><p class="muted">Ticked items fill in. Existing values are only replaced if you tick them.</p>
    ${rows.map((x, n) => `<div class="rev"><label class="chk"><input type="checkbox" data-on="${n}" ${x.on ? 'checked' : ''}> ${esc(x.label)}</label>
      ${x.val.includes('\n') ? `<textarea data-val="${n}">${esc(x.val)}</textarea>` : `<input data-val="${n}" value="${esc(x.val)}">`}${x.old ? `<small class="muted">Currently: ${esc(x.old)}</small>` : ''}</div>`).join('')}
    ${apps.length ? `<label class="chk"><input type="checkbox" id="impApps" checked> Add ${apps.length} appliance${apps.length > 1 ? 's' : ''}: ${esc(apps.map(a => [a.location, a.make, a.model].filter(Boolean).join(' ')).join('; '))}</label>` : ''}
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="fapply">✓ Apply</button></div>`);
  $('#fapply').onclick = () => { rows.forEach((x, n) => { if ($(`[data-on="${n}"]`).checked) set(job.data, x.p, $(`[data-val="${n}"]`).value.trim()); });
    if (apps.length && $('#impApps')?.checked) { const blank = job.data.appliances.filter(a => Object.keys(a).every(k => ['gasType', 'owned', 'inspected'].includes(k)));
      job.data.appliances = job.data.appliances.filter(a => !blank.includes(a)).concat(apps.map(a => ({ ...newAppliance(), ...a }))); }
    if (get(job.data, 'issue.date')) set(job.data, 'issue.nextDue', get(job.data, 'issue.nextDue') || plus12m(get(job.data, 'issue.date')));
    closeModal(); scheduleSave(); renderJob(); toast('Imported – please check every field'); };
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
  const s = job.data.sigs || {};
  return `<section class="card"><h2>Signatures</h2>${['engineer', 'recipient'].map(w => `<div class="sigbox"><span>${w === 'engineer' ? 'Engineer' : 'Recipient (landlord / agent / tenant)'}</span>
    ${s[w] ? `<img src="${s[w]}" alt="signature">` : '<div class="sigempty">Not signed</div>'}<div class="btns"><button class="btn" data-sign="${w}">✍ ${s[w] ? 'Re-sign' : 'Sign'}</button>${s[w] ? `<button class="btn danger" data-clr="${w}">Clear</button>` : ''}</div></div>`).join('')}
    ${settings.engineerSig && !s.engineer ? '<button class="btn" id="useSaved">Use my saved engineer signature</button>' : ''}</section>
    <section class="card"><h2>Checks before issue</h2><div id="checks"></div></section>
    <section class="card"><button class="btn big pri" id="issueBtn">${job.status === 'issued' ? '✓ Issued – re-issue' : 'Issue certificate'}</button>
    <button class="btn big" id="pdfBtn">📄 Create PDF</button><button class="btn big" id="shareBtn" ${navigator.canShare ? '' : 'hidden'}>📤 Share PDF</button>
    <label class="f"><span>Certificate ref</span><input id="refEdit" value="${esc(job.reportNo)}"></label>
    <button class="btn danger" id="delJob">Delete this certificate</button></section>`;
}
function renderChecks() {
  const f = formById(job.kind); const issues = f.check(job.data);
  $('#checks').innerHTML = issues.length ? issues.map(x => `<a class="issue ${x.lvl === 'warn' ? 'warn' : ''}" href="#/job/${job.id}/${x.tab}"><b>${x.lvl === 'bad' ? '✕' : '!'}</b><span>${esc(x.msg)}</span></a>`).join('') : '<p class="okp">✓ All checks complete</p>';
  return issues;
}
function bindSign() {
  renderChecks();
  main.querySelectorAll('[data-sign]').forEach(b => (b.onclick = () => sigPad(b.dataset.sign)));
  main.querySelectorAll('[data-clr]').forEach(b => (b.onclick = () => { delete job.data.sigs[b.dataset.clr]; scheduleSave(); renderJob(); }));
  $('#useSaved') && ($('#useSaved').onclick = () => { job.data.sigs.engineer = settings.engineerSig; scheduleSave(); renderJob(); });
  $('#issueBtn').onclick = async () => { const bad = renderChecks().filter(x => x.lvl === 'bad');
    if (bad.length) return toast(`Fix ${bad.length} item${bad.length > 1 ? 's' : ''} marked ✕ first`);
    job.status = 'issued'; job.issuedAt = Date.now(); await saveNow(); renderJob(); toast('Issued ✓ – create or share the PDF'); };
  $('#pdfBtn').onclick = () => makePdf('download'); $('#shareBtn').onclick = () => makePdf('share');
  $('#refEdit').onchange = async e => { const v = e.target.value.trim().toUpperCase(); const jobs = await db.allJobs();
    if (!v || isDuplicate(v, jobs, job.id)) { e.target.value = job.reportNo; return toast('That ref is empty or already used'); } job.reportNo = v; scheduleSave(); top(v, formById(job.kind).short, true); };
  $('#delJob').onclick = () => { modal(`<h2>Delete ${esc(job.reportNo)}?</h2><p>This can’t be undone (unless you have a backup).</p><div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn danger" id="dok">Delete</button></div>`);
    $('#dok').onclick = async () => { const id = job.id; job = null; await db.deleteJob(id); closeModal(); location.hash = '#/'; }; };
}
async function makePdf(mode) {
  if (job.status !== 'issued') toast('Draft PDF – issue the certificate when complete');
  const doc = buildCp12Pdf(job, settings); const name = pdfName(job);
  if (mode === 'share') { const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch {} return; } }
  doc.save(name);
}
function sigPad(who, onDone) {
  modal(`<h2>Sign – ${who === 'engineer' ? 'engineer' : who === 'saved' ? 'save my signature' : 'recipient'}</h2><canvas id="sig" width="900" height="300"></canvas>
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
  const rec = new SR(); rec.lang = 'en-GB'; rec.interimResults = true; let txt = '', done = false;
  modal(`<h2>🎤 ${esc(label)}</h2><div id="vlive" class="vlive">Listening…</div><div class="btns"><button class="btn" id="vc">Cancel</button><button class="btn pri" id="vs">Done</button></div>`);
  $('#vc').onclick = () => { done = true; try { rec.abort(); } catch {} closeModal(); }; $('#vs').onclick = () => { try { rec.stop(); } catch {} };
  rec.onresult = e => { txt = [...e.results].map(r => r[0].transcript).join(''); $('#vlive') && ($('#vlive').textContent = txt); };
  rec.onerror = e => { if (done) return; done = true; closeModal();
    if (e.error === 'service-not-allowed' || e.error === 'language-not-supported') return noVoice(el, true);
    toast(e.error === 'not-allowed' ? 'Microphone blocked – allow the mic for this site in your browser settings' : e.error === 'network' ? 'Voice needs a connection – use your keyboard’s mic offline' : 'Didn’t catch that – try again'); };
  rec.onend = () => { if (done) return; done = true; closeModal(); txt.trim() ? fill(txt.trim()) : toast('Didn’t catch that'); };
  try { rec.start(); } catch (e) { done = true; closeModal(); noVoice(el, true); }
};

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
