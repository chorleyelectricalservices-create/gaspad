// Shared building blocks for all GasPad forms. Pure module.
import { get, YN, YNA, PF, FLUES, APPLIANCE_TYPES, isoDate, plus12m } from './cp12.js';
export { get, YN, YNA, PF, FLUES, APPLIANCE_TYPES, isoDate, plus12m };

export const party = (key, title, nameLabel = 'Name') => ({ id: key, title, fields: [
  { k: `${key}.name`, l: nameLabel, t: 'text', al: ['customer name', 'customer', 'name'] },
  { k: `${key}.address`, l: 'Address', t: 'addr' },
  { k: `${key}.phone`, l: 'Phone', t: 'tel' },
  { k: `${key}.email`, l: 'Email', t: 'email' } ] });
export const propertySec = () => ({ id: 'property', title: 'Property (installation address)', fields: [
  { k: 'property.address', l: 'Property address', t: 'addr', al: ['property address', 'installation address', 'address'] },
  { k: 'property.occupier', l: 'Occupier (if different)', t: 'text', al: ['occupier', 'tenant'] } ] });
export const engineerSec = (title = 'Engineer') => ({ id: 'engineer', title, fields: [
  { k: 'engineer.name', l: 'Engineer name', t: 'text', al: ['engineer name', 'engineer'] },
  { k: 'engineer.business', l: 'Business name', t: 'text' },
  { k: 'engineer.address', l: 'Business address', t: 'addr', al: ['business address'] },
  { k: 'engineer.phone', l: 'Phone', t: 'tel' },
  { k: 'engineer.regNo', l: 'Gas Safe reg no.', t: 'text', im: 'numeric' },
  { k: 'engineer.idCard', l: 'Engineer ID card no.', t: 'text', im: 'numeric' } ] });

export function today() { return isoDate(new Date()); }
/** Base check list helper */
export function checker() { const out = []; const p = (lvl, msg, tab) => out.push({ lvl, msg, tab }); return { out, p }; }
export function checkEngineer(d, p) {
  if (!get(d, 'engineer.name')) p('bad', 'Engineer name missing', 'details');
  if (!/^\d{4,7}$/.test(String(get(d, 'engineer.regNo') || '').trim())) p('bad', 'Gas Safe reg no. missing or not a number', 'details');
  if (!get(d, 'engineer.idCard')) p('warn', 'Engineer ID card no. missing', 'details');
}
export function checkSigs(d, p, sigs, tab = 'sign') {
  for (const s of sigs) if (!d.sigs?.[s.k] && !(s.k !== 'engineer' && d.sigs?.[s.k + 'Refused'])) p(s.k === 'engineer' ? 'bad' : 'warn', `${s.l} signature missing`, tab);
}
export const firstLine = s => String(s || '').split('\n')[0];
