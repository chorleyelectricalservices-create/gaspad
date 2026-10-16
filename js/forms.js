// Certificate form registry. To add a new form: create js/forms/<id>.js exporting a FORM
// object (see cp12.js), import it here and set active:true. The home picker, list,
// refs, editor tabs and PDF dispatch all read from this registry.
import { CP12 } from './cp12.js';

export const FORMS = [
  CP12,
  { id: 'service', code: 'SR', title: 'Service / maintenance record', short: 'Service record', icon: '🔧', active: false },
  { id: 'warning', code: 'WN', title: 'Gas warning notice (AR / ID)', short: 'Warning notice', icon: '⚠️', active: false },
  { id: 'commission', code: 'BM', title: 'Commissioning / Benchmark checklist', short: 'Commissioning', icon: '✅', active: false },
  { id: 'tightness', code: 'TT', title: 'Tightness test & purge record', short: 'Tightness & purge', icon: '🧪', active: false },
];
export const formById = id => FORMS.find(f => f.id === id);
