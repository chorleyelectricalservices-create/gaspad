import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { buildCp12Pdf } from '../js/pdf.js'; import { defaults } from '../js/cp12.js';
// Needs the npm jspdf + jspdf-autotable packages (dev only): NODE_PATH or a local node_modules.
let jsPDF; try { ({ jsPDF } = await import('jspdf')); const at = await import('jspdf-autotable'); (at.applyPlugin || at.default?.applyPlugin)?.(jsPDF); } catch {}
test('PDF builds headlessly', { skip: !jsPDF && 'jspdf not installed' }, () => {
  const d = defaults(); Object.assign(d.landlord, { name: 'Jane Landlord', address: '1 High St\nChorley\nPR7 1AA' }); d.property.address = '22 Park Rd\nChorley\nPR7 2BB';
  Object.assign(d.engineer, { name: 'Tom Daniels', regNo: '123456', idCard: '7654321' });
  d.appliances = [{ location: 'Kitchen', type: 'Combi boiler', make: 'Worcester', model: 'Greenstar 30i', serial: 'X1', gcNo: '47-311-90', owned: 'Yes', inspected: 'Yes', flue: 'RS', heatInput: '30.6', safetyDevice: 'Pass', ventilation: 'N/A', flueVisual: 'Pass', spillage: 'N/A', flueFlow: 'Pass', co: '12', co2: '9.1', ratio: '0.0001', safe: 'Yes' },
    { location: 'Lounge', type: 'Gas fire', make: 'Baxi', owned: 'Yes', inspected: 'Yes', flue: 'OF', pressure: '14', spillage: 'Fail', safe: 'No', notes: 'Spillage at draught diverter' }];
  Object.assign(d.install, { pipework: 'Yes', tightness: 'Pass', ecv: 'Yes', bonding: 'Yes', coFitted: 'Yes', coTested: 'Yes' });
  Object.assign(d.defects, { found: 'Gas fire spillage', remedial: 'Fire capped, isolated', warningIssued: 'Yes', warningLabel: 'Yes', warningCat: 'ID' });
  const doc = buildCp12Pdf({ reportNo: 'GAS-CP12-2610-0001', data: d }, {}, jsPDF);
  const buf = Buffer.from(doc.output('arraybuffer')); fs.writeFileSync(process.env.PDF_OUT || '/tmp/sample-cp12.pdf', buf);
  assert.ok(buf.length > 5000); assert.equal(buf.slice(0, 4).toString(), '%PDF');
});
