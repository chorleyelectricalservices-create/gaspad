// Certificate form registry. To add a form: create js/<form>.js exporting a FORM object
// (see cp12.js / service.js), import it here, and add the file to sw.js ASSETS.
// Each form: { id, code, title, short, icon, active, party, SECTIONS, TABS, SIGS, ROWS?, defaults, check, compute?, summary }.
import { CP12 } from './cp12.js';
import { SERVICE } from './service.js';
import { WARNING } from './warning.js';
import { COMMISSION } from './commission.js';
import { TIGHTNESS } from './tightness.js';

export const FORMS = [CP12, SERVICE, WARNING, COMMISSION, TIGHTNESS];
export const formById = id => FORMS.find(f => f.id === id);
