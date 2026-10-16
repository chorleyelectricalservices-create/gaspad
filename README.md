# GasPad

Offline phone PWA for UK gas engineers. v1 does the **Landlord Gas Safety Record (CP12)**, which follows the Gas Safety (Installation and Use) Regulations 1998, reg 36.

- Data is stored on the phone (IndexedDB), with JSON backup and restore
- PDF is made on the phone (jsPDF)
- Voice dictation into any field
- Gemini photo reading (data badge scan per appliance, plus whole-form import) using your own key, which is kept on the phone only
- postcodes.io lookup, plus optional Ideal Postcodes or Postcoder keys

No Gas Safe Register branding is used.

**Adding a form:** create `js/<form>.js` exporting a FORM object like `CP12` in `js/cp12.js`. Register it in `js/forms.js` with `active: true`, give it a PDF builder, add the file to `sw.js` ASSETS and bump `VERSION`.

Tests: `npm test`. The PDF test runs when the `jspdf` and `jspdf-autotable` npm packages are available.
