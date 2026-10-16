// CP12 PDF – A4 landscape, built on the phone with jsPDF + autoTable. No Gas Safe branding.
import { FLUE_NAMES, get } from './cp12.js';

const C = { ink: [15, 23, 42], mut: [100, 116, 139], acc: [11, 59, 46], line: [203, 213, 225], ok: [21, 128, 61], bad: [185, 28, 28], head: [226, 236, 232] };
const ukDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
const v = x => (x == null || x === '' ? '–' : String(x));

export function buildCp12Pdf(job, settings = {}, jsPDF = globalThis.jspdf?.jsPDF) {
  const d = job.data; const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210, M = 10; let y = M;
  // header
  doc.setFillColor(...C.acc); doc.rect(0, 0, W, 22, 'F');
  if (settings.logo) { try { doc.addImage(settings.logo, M, 3, 32, 16, undefined, 'FAST'); } catch {} }
  const hx = settings.logo ? M + 36 : M;
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('LANDLORD GAS SAFETY RECORD', hx, 10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text('Gas Safety (Installation and Use) Regulations 1998 – Regulation 36 (CP12)', hx, 15.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(`Ref: ${job.reportNo || ''}`, W - M, 9, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(`Inspected: ${ukDate(get(d, 'issue.date'))}    Next check due by: ${ukDate(get(d, 'issue.nextDue'))}`, W - M, 15.5, { align: 'right' });
  y = 26;
  // three party boxes
  const bw = (W - 2 * M - 8) / 3; const boxes = [
    ['LANDLORD', [get(d, 'landlord.name'), get(d, 'landlord.company'), get(d, 'landlord.address'), get(d, 'landlord.phone'), get(d, 'landlord.email')]],
    ['PROPERTY (INSTALLATION ADDRESS)', [get(d, 'property.tenant') && `Tenant: ${get(d, 'property.tenant')}`, get(d, 'property.address'), get(d, 'property.phone')]],
    ['ENGINEER', [get(d, 'engineer.name'), get(d, 'engineer.business'), get(d, 'engineer.address'), get(d, 'engineer.phone'),
      `Gas Safe reg no.: ${v(get(d, 'engineer.regNo'))}    ID card no.: ${v(get(d, 'engineer.idCard'))}`]]];
  let bh = 0; const lines = boxes.map(([, ls]) => doc.setFontSize(8).splitTextToSize(ls.filter(Boolean).join('\n'), bw - 4));
  bh = Math.max(20, ...lines.map(l => 8 + l.length * 3.4));
  boxes.forEach(([t], i) => { const x = M + i * (bw + 4);
    doc.setDrawColor(...C.line); doc.setFillColor(...C.head); doc.rect(x, y, bw, 5, 'F'); doc.rect(x, y, bw, bh);
    doc.setTextColor(...C.acc); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text(t, x + 2, y + 3.6);
    doc.setTextColor(...C.ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(lines[i], x + 2, y + 8.5); });
  y += bh + 4;
  // appliance table
  const apps = d.appliances || [];
  const head = [['#', 'Location', 'Type', 'Make / model', 'Serial / GC no.', 'L’lord owned', 'Insp.', 'Flue', 'Op. press. mbar / heat kW', 'Safety device', 'Vent.', 'Flue visual', 'Spillage', 'Flue flow', 'CO ppm', 'CO₂ %', 'Ratio', 'SAFE TO USE']];
  const body = apps.map((a, i) => [i + 1, v(a.location), v(a.type), [a.make, a.model].filter(Boolean).join(' ') || '–', [a.serial, a.gcNo && `GC ${a.gcNo}`].filter(Boolean).join('\n') || '–',
    v(a.owned), v(a.inspected), a.flue ? `${a.flue}` : '–', [a.pressure && `${a.pressure} mbar`, a.heatInput && `${a.heatInput} kW`].filter(Boolean).join('\n') || '–',
    v(a.safetyDevice), v(a.ventilation), v(a.flueVisual), v(a.spillage), v(a.flueFlow), v(a.co), v(a.co2), v(a.ratio), v(a.safe).toUpperCase()]);
  doc.autoTable({ startY: y, head: head.map(r => r.map(h => h.replace('₂', '2'))), body: body.map(r => r.map(c => String(c).replace(/₂/g, '2'))), margin: { left: M, right: M }, theme: 'grid',
    styles: { fontSize: 7.2, cellPadding: 1.2, lineColor: C.line, lineWidth: 0.2, textColor: C.ink, valign: 'middle' },
    headStyles: { fillColor: C.acc, textColor: 255, fontSize: 6.6, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 6, halign: 'center' }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 30 }, 4: { cellWidth: 26 }, 17: { cellWidth: 16, halign: 'center', fontStyle: 'bold' } },
    didParseCell: h => { if (h.section !== 'body') return; const t = String(h.cell.raw);
      if (h.column.index === 17) h.cell.styles.textColor = t === 'NO' ? C.bad : t === 'YES' ? C.ok : C.ink;
      else if (h.column.index > 4 && (t === 'Fail' || (t === 'No' && h.column.index !== 5))) { h.cell.styles.textColor = C.bad; h.cell.styles.fontStyle = 'bold'; }
      if (h.column.index > 4 && h.column.index < 17) h.cell.styles.halign = 'center'; } });
  y = doc.lastAutoTable.finalY + 2;
  const notes = apps.map((a, i) => a.notes && `${i + 1}: ${a.notes}`).filter(Boolean);
  doc.setFontSize(6.8); doc.setTextColor(...C.mut);
  doc.text(`Flue types: ${Object.entries(FLUE_NAMES).map(([k, n]) => `${k} = ${n}`).join(', ')}. Ratio = CO ppm ÷ (CO2 % × 10,000).`, M, y + 2.5); y += 5;
  if (notes.length) { doc.setTextColor(...C.ink); doc.setFontSize(7.5); const t = doc.splitTextToSize('Appliance notes – ' + notes.join('   '), W - 2 * M); doc.text(t, M, y + 2.5); y += t.length * 3.2 + 2; }
  // checks + defects
  const yn = k => v(get(d, k));
  const checks = [['Gas installation pipework visual inspection satisfactory', yn('install.pipework')], ['Gas tightness test', yn('install.tightness') + (get(d, 'install.tightnessDetail') ? ` (${get(d, 'install.tightnessDetail')})` : '')],
    ['Emergency control valve (ECV) accessible', yn('install.ecv')], ['Protective equipotential bonding satisfactory', yn('install.bonding')],
    ['CO alarm(s) fitted', yn('install.coFitted') + (get(d, 'install.coLocation') ? ` – ${get(d, 'install.coLocation')}` : '')], ['CO alarm(s) tested & satisfactory', yn('install.coTested')]];
  const half = (W - 2 * M - 4) / 2;
  if (y > H - 70) { doc.addPage(); y = M; }
  doc.autoTable({ startY: y, head: [['INSTALLATION CHECKS', 'Result']], body: checks, margin: { left: M, right: M + half + 4 }, theme: 'grid',
    styles: { fontSize: 7.6, cellPadding: 1.3, lineColor: C.line, lineWidth: 0.2, textColor: C.ink }, headStyles: { fillColor: C.acc, textColor: 255, fontSize: 7.4 },
    columnStyles: { 1: { cellWidth: 36, fontStyle: 'bold' } },
    didParseCell: h => { if (h.section === 'body' && h.column.index === 1 && /^(Fail|No)/.test(String(h.cell.raw))) h.cell.styles.textColor = C.bad; } });
  const yL = doc.lastAutoTable.finalY;
  const warn = get(d, 'defects.warningIssued') === 'Yes';
  doc.autoTable({ startY: y, head: [['DEFECTS IDENTIFIED & REMEDIAL ACTION']], body: [
      [`Defects: ${get(d, 'defects.found') || 'None recorded'}`], [`Remedial action taken: ${get(d, 'defects.remedial') || '–'}`],
      [`Warning notice issued: ${yn('defects.warningIssued')}${warn && get(d, 'defects.warningCat') && get(d, 'defects.warningCat') !== 'N/A' ? ` (${get(d, 'defects.warningCat')})` : ''}${get(d, 'defects.warningRef') ? ` – ref ${get(d, 'defects.warningRef')}` : ''}     Warning label attached: ${yn('defects.warningLabel')}`]],
    margin: { left: M + half + 4, right: M }, theme: 'grid', styles: { fontSize: 7.6, cellPadding: 1.4, lineColor: C.line, lineWidth: 0.2, textColor: C.ink },
    headStyles: { fillColor: C.acc, textColor: 255, fontSize: 7.4 }, didParseCell: h => { if (h.section === 'body' && h.row.index === 2 && warn) { h.cell.styles.textColor = C.bad; h.cell.styles.fontStyle = 'bold'; } } });
  y = Math.max(yL, doc.lastAutoTable.finalY) + 4;
  // signatures
  if (y > H - 34) { doc.addPage(); y = M; }
  const sw = (W - 2 * M - 4) / 2;
  [['ENGINEER', get(d, 'engineer.name'), d.sigs?.engineer], [`RECEIVED BY (${(get(d, 'issue.recipientRole') || 'Landlord').toUpperCase()})`, get(d, 'issue.recipient'), d.sigs?.recipient]].forEach(([t, name, img], i) => {
    const x = M + i * (sw + 4); doc.setDrawColor(...C.line); doc.rect(x, y, sw, 26);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C.acc); doc.text(t, x + 2, y + 4);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.ink); doc.setFontSize(8.5); doc.text(`Name: ${name || ''}`, x + 2, y + 23);
    doc.text(`Date: ${ukDate(get(d, 'issue.date'))}`, x + sw - 2, y + 23, { align: 'right' });
    if (img) { try { doc.addImage(img, 'PNG', x + 30, y + 3, 60, 16); } catch {} } });
  y += 30;
  const foot = 'This record must be retained for at least 2 years. A copy must be given to each existing tenant within 28 days of the check, and to any new tenant before they move in. '
    + 'This record covers only the appliances and installation listed, inspected on the date shown; it is not a guarantee of future safety. Appliance checks are visual and functional and do not include a full strip-down service.';
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(6.6); doc.setTextColor(...C.mut);
    doc.text(doc.splitTextToSize(foot, W - 2 * M - 30), M, H - 7); doc.text(`Page ${p} of ${pages}`, W - M, H - 4, { align: 'right' }); }
  return doc;
}
export const pdfName = job => `${job.reportNo || 'CP12'} ${String(job.data?.property?.address || '').split('\n')[0]}`.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') + '.pdf';
