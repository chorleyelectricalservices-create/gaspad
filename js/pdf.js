// PDFs for every GasPad form – built on the phone with jsPDF + autoTable. Clean, modern, professional.
// No Gas Safe Register branding. CP12 is A4 landscape (appliance grid); the other forms are A4 portrait.
import { FLUE_NAMES, get } from './cp12.js';
import { formById } from './forms.js';
import { ID_TEXT, AR_TEXT, ESP_PHONE } from './warning.js';

const C = { brand: [15, 61, 46], brand2: [22, 101, 74], amber: [245, 158, 11], ink: [17, 24, 39], mut: [107, 114, 128], line: [226, 232, 240], tint: [240, 247, 244], ok: [21, 128, 61], bad: [190, 18, 60], warnBg: [255, 247, 237] };
const ukDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
const v = x => (x == null || x === '' ? '–' : String(x));
const asc = s => String(s ?? '').replace(/₂/g, '2').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/³/g, '3').replace(/[✓]/g, '');
const NEG = /^(Fail|No|Refused|FAIL|NO)$/;

function header(doc, { W, M, title, sub, ref, lines, logo }) {
  doc.setFillColor(...C.brand); doc.rect(0, 0, W, 26, 'F'); doc.setFillColor(...C.amber); doc.rect(0, 26, W, 1.2, 'F');
  let hx = M; if (logo) { try { doc.addImage(logo, M, 4, 30, 18, undefined, 'FAST'); hx = M + 34; } catch {} }
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(asc(title).toUpperCase(), hx, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(209, 250, 229); doc.text(asc(sub), hx, 18.5);
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(asc(ref), W - M, 10.5, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); (lines || []).forEach((l, i) => doc.text(asc(l), W - M, 16 + i * 4.6, { align: 'right' }));
  return 32;
}
function cards(doc, y, { W, M }, list) {
  const gap = 4, bw = (W - 2 * M - gap * (list.length - 1)) / list.length; doc.setFontSize(8.3);
  const lines = list.map(([, ls]) => doc.splitTextToSize(asc(ls.filter(Boolean).join('\n')) || '–', bw - 6));
  const bh = Math.max(22, ...lines.map(l => 10 + l.length * 3.6));
  list.forEach(([t], i) => { const x = M + i * (bw + gap);
    doc.setFillColor(...C.tint); doc.setDrawColor(...C.line); doc.roundedRect(x, y, bw, bh, 2.5, 2.5, 'FD');
    doc.setTextColor(...C.brand2); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.text(asc(t).toUpperCase(), x + 3, y + 5);
    doc.setTextColor(...C.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.3); doc.text(lines[i], x + 3, y + 10); });
  return y + bh + 5;
}
function banner(doc, y, { W, M }, text, tone) {
  const fill = tone === 'bad' ? [254, 226, 226] : tone === 'ok' ? [220, 252, 231] : C.warnBg, ink = tone === 'bad' ? C.bad : tone === 'ok' ? C.ok : [180, 83, 9];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); const t = doc.splitTextToSize(asc(text), W - 2 * M - 12); const h = 6 + t.length * 4.2;
  doc.setFillColor(...fill); doc.setDrawColor(...ink); doc.setLineWidth(0.5); doc.roundedRect(M, y, W - 2 * M, h, 2.5, 2.5, 'FD'); doc.setLineWidth(0.2);
  doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.text(t, M + 5, y + 6); doc.setFont('helvetica', 'normal');
  return y + h + 5;
}
const tableStyle = { theme: 'plain', styles: { fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 2.5, right: 2.5 }, textColor: C.ink, lineColor: C.line, lineWidth: { bottom: 0.2 } },
  headStyles: { fillColor: C.brand, textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 } } };
function kv(doc, title, rows, x, w, y) {
  doc.autoTable({ ...tableStyle, startY: y, margin: { left: x, right: doc.internal.pageSize.getWidth() - x - w }, tableWidth: w,
    head: [[{ content: asc(title).toUpperCase(), colSpan: 2 }]], body: rows.map(([a, b]) => [asc(a), asc(b)]),
    columnStyles: { 0: { cellWidth: w * 0.56, textColor: C.mut }, 1: { fontStyle: 'bold' } },
    didParseCell: h => { if (h.section === 'body' && h.column.index === 1 && NEG.test(String(h.cell.raw))) h.cell.styles.textColor = C.bad;
      if (h.section === 'body' && h.column.index === 1 && /^(Pass|Yes|PASS)$/.test(String(h.cell.raw))) h.cell.styles.textColor = C.ok; } });
  return { y: doc.lastAutoTable.finalY, page: doc.getCurrentPageInfo().pageNumber };
}
/** Lay sections out in two columns (long text sections full width). */
function flow(doc, y, { W, M, H }, sections) {
  const gw = (W - 2 * M - 5) / 2; let col = [y, y], page = doc.getCurrentPageInfo().pageNumber;
  for (const s of sections) {
    if (!s.rows.length) continue;
    const wide = s.wide || s.rows.some(([, b]) => String(b).length > 110);
    if (wide) { const sy = Math.max(...col); if (sy > H - 30) { doc.addPage(); col = [16, 16]; } else col = [sy, sy];
      const r = kv(doc, s.title, s.rows, M, W - 2 * M, col[0]); col = [r.y + 5, r.y + 5]; page = r.page; continue; }
    const i = col[0] <= col[1] ? 0 : 1; if (col[i] > H - 30) { doc.addPage(); col = [16, 16]; page++; }
    doc.setPage(page); const r = kv(doc, s.title, s.rows, M + i * (gw + 5), gw, col[i]);
    if (r.page !== page) { page = r.page; col = [r.y + 5, r.y + 5]; } else col[i] = r.y + 5;
  }
  doc.setPage(page); return Math.max(...col);
}
function sigBlock(doc, y, { W, M, H }, sigs) {
  if (y > H - 42) { doc.addPage(); y = 16; }
  const gap = 5, sw = (W - 2 * M - gap) / 2;
  sigs.forEach(([t, name, img, date, note], i) => { const x = M + i * (sw + gap);
    doc.setDrawColor(...C.line); doc.setFillColor(255); doc.roundedRect(x, y, sw, 30, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.setTextColor(...C.brand2); doc.text(asc(t).toUpperCase(), x + 3, y + 5);
    if (img) { try { doc.addImage(img, 'PNG', x + 3, y + 7, 62, 15); } catch {} } else if (note) { doc.setFontSize(8.5); doc.setTextColor(...C.bad); doc.text(asc(note), x + 3, y + 16); }
    doc.setDrawColor(...C.line); doc.line(x + 3, y + 23, x + sw - 3, y + 23);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.ink); doc.setFontSize(8.5); doc.text(asc(`Name: ${name || ''}`), x + 3, y + 27.5);
    doc.text(asc(`Date: ${ukDate(date)}`), x + sw - 3, y + 27.5, { align: 'right' }); });
  return y + 35;
}
function footer(doc, { W, M, H }, text, ref) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setDrawColor(...C.line); doc.line(M, H - 13, W - M, H - 13);
    doc.setFontSize(6.6); doc.setTextColor(...C.mut); doc.text(doc.splitTextToSize(asc(text), W - 2 * M - 34), M, H - 9.5);
    doc.text(`${asc(ref)} · Page ${p} of ${pages}`, W - M, H - 9.5, { align: 'right' }); }
}
const engLines = d => [get(d, 'engineer.name'), get(d, 'engineer.business'), get(d, 'engineer.address'), get(d, 'engineer.phone'),
  `Gas Safe reg no.: ${v(get(d, 'engineer.regNo'))}`, `ID card no.: ${v(get(d, 'engineer.idCard'))}`];
const partyLines = (o = {}) => [o.name, o.company, o.address, o.phone, o.email];

// ---------------- CP12 (landscape) ----------------
export function buildCp12Pdf(job, settings = {}, jsPDF = globalThis.jspdf?.jsPDF) {
  const d = job.data; const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); const G = { W: 297, H: 210, M: 10 };
  let y = header(doc, { ...G, title: 'Landlord Gas Safety Record', sub: 'Gas Safety (Installation and Use) Regulations 1998 – Regulation 36 (CP12)', ref: job.reportNo,
    lines: [`Inspected: ${ukDate(get(d, 'issue.date'))}`, `Next check due by: ${ukDate(get(d, 'issue.nextDue'))}`], logo: settings.logo });
  y = cards(doc, y, G, [['Landlord', partyLines(d.landlord)], ['Property (installation address)', [get(d, 'property.tenant') && `Tenant: ${get(d, 'property.tenant')}`, get(d, 'property.address'), get(d, 'property.phone')]],
    ['Engineer', [get(d, 'engineer.name'), get(d, 'engineer.business'), get(d, 'engineer.phone'), `Gas Safe reg no.: ${v(get(d, 'engineer.regNo'))}   ID card no.: ${v(get(d, 'engineer.idCard'))}`]]]);
  const apps = d.appliances || [];
  const head = [['#', 'Location', 'Type', 'Make / model', 'Serial / GC no.', "L'lord owned", 'Insp.', 'Flue', 'Op. press. / heat input', 'Safety device', 'Vent.', 'Flue visual', 'Spillage', 'Flue flow', 'CO ppm', 'CO2 %', 'Ratio', 'SAFE TO USE']];
  const body = apps.map((a, i) => [i + 1, v(a.location), v(a.type), [a.make, a.model].filter(Boolean).join(' ') || '–', [a.serial, a.gcNo && `GC ${a.gcNo}`].filter(Boolean).join('\n') || '–',
    v(a.owned), v(a.inspected), v(a.flue), [a.pressure && `${a.pressure} mbar`, a.heatInput && `${a.heatInput} kW`].filter(Boolean).join('\n') || '–',
    v(a.safetyDevice), v(a.ventilation), v(a.flueVisual), v(a.spillage), v(a.flueFlow), v(a.co), v(a.co2), v(a.ratio), v(a.safe).toUpperCase()].map(asc));
  doc.autoTable({ startY: y, head, body, margin: { left: G.M, right: G.M }, theme: 'striped',
    styles: { fontSize: 7.3, cellPadding: 1.5, textColor: C.ink, valign: 'middle', lineColor: C.line, lineWidth: 0 }, alternateRowStyles: { fillColor: [248, 250, 252] },
    headStyles: { fillColor: C.brand, textColor: 255, fontSize: 6.6, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    columnStyles: { 0: { cellWidth: 6, halign: 'center' }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 30 }, 4: { cellWidth: 26 }, 17: { cellWidth: 17, halign: 'center', fontStyle: 'bold' } },
    didParseCell: h => { if (h.section !== 'body') return; const t = String(h.cell.raw);
      if (h.column.index === 17) { h.cell.styles.textColor = 255; h.cell.styles.fillColor = t === 'NO' ? C.bad : t === 'YES' ? C.ok : C.mut; }
      else if (h.column.index > 4 && (t === 'Fail' || (t === 'No' && h.column.index !== 5))) { h.cell.styles.textColor = C.bad; h.cell.styles.fontStyle = 'bold'; }
      if (h.column.index > 4 && h.column.index < 17) h.cell.styles.halign = 'center'; } });
  y = doc.lastAutoTable.finalY + 3;
  doc.setFontSize(6.8); doc.setTextColor(...C.mut);
  doc.text(`Flue types: ${Object.entries(FLUE_NAMES).map(([k, n]) => `${k} = ${n}`).join(', ')}. Ratio = CO ppm / (CO2 % x 10,000).`, G.M, y + 2); y += 5;
  const notes = apps.map((a, i) => a.notes && `${i + 1}: ${a.notes}`).filter(Boolean);
  if (notes.length) { doc.setTextColor(...C.ink); doc.setFontSize(7.6); const t = doc.splitTextToSize(asc('Appliance notes – ' + notes.join('   ')), G.W - 2 * G.M); doc.text(t, G.M, y + 2); y += t.length * 3.3 + 3; }
  const yn = k => v(get(d, k)); const half = (G.W - 2 * G.M - 5) / 2;
  if (y > G.H - 75) { doc.addPage(); y = 16; }
  const warn = get(d, 'defects.warningIssued') === 'Yes';
  const a = kv(doc, 'Installation checks', [['Gas installation pipework visual inspection satisfactory', yn('install.pipework')],
    ['Gas tightness test', yn('install.tightness') + (get(d, 'install.tightnessDetail') ? ` (${get(d, 'install.tightnessDetail')})` : '')],
    ['Emergency control valve (ECV) accessible', yn('install.ecv')], ['Protective equipotential bonding satisfactory', yn('install.bonding')],
    ['CO alarm(s) fitted', yn('install.coFitted') + (get(d, 'install.coLocation') ? ` – ${get(d, 'install.coLocation')}` : '')], ['CO alarm(s) tested & satisfactory', yn('install.coTested')]], G.M, half, y);
  const b = kv(doc, 'Defects & remedial action', [['Defects identified', get(d, 'defects.found') || 'None recorded'], ['Remedial action taken', yn('defects.remedial')],
    ['Warning notice issued', yn('defects.warningIssued') + (warn && /ID|AR/.test(get(d, 'defects.warningCat') || '') ? ` (${get(d, 'defects.warningCat')})` : '') + (get(d, 'defects.warningRef') ? ` – ref ${get(d, 'defects.warningRef')}` : '')],
    ['Warning label attached', yn('defects.warningLabel')]], G.M + half + 5, half, y);
  y = Math.max(a.y, b.y) + 5;
  y = sigBlock(doc, y, G, [['Engineer', get(d, 'engineer.name'), d.sigs?.engineer, get(d, 'issue.date')], [`Received by (${get(d, 'issue.recipientRole') || 'Landlord'})`, get(d, 'issue.recipient'), d.sigs?.recipient, get(d, 'issue.date')]]);
  footer(doc, G, 'Keep this record for at least 2 years. Give a copy to each existing tenant within 28 days of the check, and to any new tenant before they move in. It covers only the appliances and installation listed, on the date shown, and is not a guarantee of future safety. Checks are visual and functional and do not include a full strip-down service.', job.reportNo);
  return doc;
}

// ---------------- generic portrait forms ----------------
function sectionRows(d, s) { return s.fields.map(f => [f.l, get(d, f.k)]).filter(([, x]) => x != null && String(x).trim() !== '').map(([l, x]) => [l, String(x)]); }
const PDF_META = {
  service: { title: 'Gas Safety & Service Record', sub: 'Appliance service and safety inspection – Gas Safety (Installation and Use) Regulations 1998',
    lines: d => [`Service date: ${ukDate(get(d, 'issue.date'))}`, `Next service due: ${ukDate(get(d, 'issue.nextDue'))}`],
    foot: 'This record covers only the appliances listed, serviced and checked on the date shown, and is not a guarantee of future safety. Have gas appliances serviced every 12 months by a Gas Safe registered engineer.' },
  warning: { title: 'Gas Warning Notice', sub: 'Unsafe situation – Gas Industry Unsafe Situations Procedure / GS(I&U)R 1998',
    lines: d => [`Date: ${ukDate(get(d, 'issue.date'))} ${get(d, 'issue.time') || ''}`, get(d, 'issue.source') ? `Related cert: ${get(d, 'issue.source')}` : ''],
    foot: `Gas emergency: ${ESP_PHONE} (24h). Do not use, or allow use of, the installation/appliance identified until it has been made safe by a Gas Safe registered engineer. Keep this notice.` },
  commission: { title: 'Boiler Commissioning Checklist', sub: 'Installation, commissioning and handover record',
    lines: d => [`Commissioned: ${ukDate(get(d, 'issue.date'))}`, `First service due: ${ukDate(get(d, 'issue.nextDue'))}`],
    foot: 'Keep this checklist with the boiler manual. Service the boiler every 12 months to maintain safety, efficiency and the manufacturer’s warranty.' },
  tightness: { title: 'Tightness Test & Purge Record', sub: 'Domestic natural gas / LPG installation – IGEM/UP/1B procedure',
    lines: d => [`Test date: ${ukDate(get(d, 'issue.date'))}`, get(d, 't.result') ? `Result: ${get(d, 't.result').toUpperCase()}` : ''],
    foot: 'Results apply to the installation as tested on the date shown. Permitted pressure drop and purge volumes were taken from the engineer’s reference tables (IGEM/UP/1B) and entered/confirmed by the engineer.' },
};
export function buildFormPdf(job, settings = {}, jsPDF = globalThis.jspdf?.jsPDF) {
  const f = formById(job.kind); const d = job.data; const meta = PDF_META[f.id];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); const G = { W: 210, H: 297, M: 12 };
  let y = header(doc, { ...G, title: meta.title, sub: meta.sub, ref: job.reportNo, lines: meta.lines(d).filter(Boolean), logo: settings.logo });
  const pk = f.party; const pTitle = f.SECTIONS.find(s => s.id === pk)?.title || 'Customer';
  y = cards(doc, y, G, [[pTitle, [...partyLines(d[pk]), d[pk]?.role && `Role: ${d[pk].role}`]], ['Property', [get(d, 'property.address'), get(d, 'property.occupier') && `Occupier: ${get(d, 'property.occupier')}`]], [f.id === 'commission' ? 'Installer' : 'Engineer', engLines(d)]]);
  if (f.id === 'warning') { const cls = get(d, 'notice.class'); if (cls) y = banner(doc, y, G, cls === 'ID' ? ID_TEXT : AR_TEXT, cls === 'ID' ? 'bad' : 'warn'); }
  if (f.id === 'tightness' && get(d, 't.result')) y = banner(doc, y, G, `Tightness test ${get(d, 't.result').toUpperCase()}: drop ${v(get(d, 't.drop'))} mbar against a maximum permitted ${v(get(d, 't.mpd'))} mbar (${get(d, 't.mpdNote') || ''}). Smell of gas: ${v(get(d, 't.smell'))}.`, get(d, 't.result') === 'Pass' ? 'ok' : 'bad');
  if (f.id === 'service' && (d.appliances || []).some(a => a.safe === 'No')) y = banner(doc, y, G, 'One or more appliances were found UNSAFE – see the appliance details and the separate warning notice.', 'bad');
  const sections = [];
  if (f.ROWS && f.id !== 'tightness') (job.data[f.ROWS.key] || []).forEach((r, i) => {
    const rows = f.ROWS.fields.map(x => [x.l, r[x.k]]).filter(([, x]) => x != null && String(x).trim() !== '').map(([l, x]) => [l, String(x)]);
    const name = [r.location, r.type, [r.make, r.model].filter(Boolean).join(' ')].filter(Boolean).join(' – ');
    if (rows.length) sections.push({ title: `${f.ROWS.title}${f.ROWS.max === 1 ? '' : ' ' + (i + 1)}${name ? ': ' + name : ''}`, rows, wide: f.id === 'service' && rows.length > 14 ? false : undefined }); });
  const skip = new Set([pk, 'property', 'engineer', 'issue']);
  for (const s of f.SECTIONS) if (!skip.has(s.id)) sections.push({ title: s.title, rows: sectionRows(d, s) });
  if (f.id === 'tightness') { // pipework table first
    const pipes = (d.pipes || []).filter(p => p.size || p.length);
    if (pipes.length) { doc.autoTable({ ...tableStyle, startY: y, margin: { left: G.M, right: G.M }, head: [['PIPEWORK', 'Length (m)', 'Volume (m3)']],
      body: [...pipes.map(p => [asc(p.size || 'Other'), v(p.length), v(p.vol)]), [{ content: 'Pipework total', styles: { fontStyle: 'bold' } }, '', { content: v(get(d, 'vol.pipe')), styles: { fontStyle: 'bold' } }]] });
      y = doc.lastAutoTable.finalY + 5; } }
  y = flow(doc, y, G, sections);
  const iss = sectionRows(d, f.SECTIONS.find(s => s.id === 'issue')).filter(([l]) => !/date|source|time/i.test(l));
  if (iss.length) y = kv(doc, 'Issue', iss, G.M, G.W - 2 * G.M, y).y + 5;
  const sg = f.SIGS.map(s => [s.l, s.k === 'engineer' ? get(d, 'engineer.name') : get(d, 'issue.recipient'), d.sigs?.[s.k], get(d, 'issue.date'), d.sigs?.[s.k + 'Refused'] ? 'Refused to sign' : '']);
  sigBlock(doc, y, G, sg);
  footer(doc, G, meta.foot, job.reportNo);
  return doc;
}
export function buildPdf(job, settings, jsPDF) { return job.kind === 'cp12' ? buildCp12Pdf(job, settings, jsPDF) : buildFormPdf(job, settings, jsPDF); }
export const pdfName = job => `${job.reportNo || 'GasPad'} ${String(job.data?.property?.address || '').split('\n')[0]}`.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') + '.pdf';
