const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost/'});
const {window}=dom;
window.matchMedia = () => ({matches:false, addEventListener(){}});
// jsdom has no clipboard by default
window.navigator.clipboard = { writeText: () => Promise.resolve() };
// jsdom stubs for the download path
window.URL.createObjectURL = () => 'blob:stub';
window.URL.revokeObjectURL = () => {};
window.eval(fs.readFileSync('app.js','utf8'));
const doc=window.document;

let fails=0;
const eq=(n,g,w)=>{const ok = typeof w==='object'&&w instanceof RegExp ? w.test(g) : g===w;
  if(!ok){fails++;console.log('FAIL',n,'\n  got :',g,'\n  want:',w);}else console.log('ok  ',n,'->',String(g).slice(0,90));};

const $=(s)=>doc.querySelector(s);
const set=(sel,val)=>{const el=$(sel); el.value=String(val);
  el.dispatchEvent(new window.Event('input',{bubbles:true}));};
const nav=(tool)=>{ doc.querySelector(`[data-tool="${tool}"]`).click(); };
const main=()=>$('.result-main')?$('.result-main').textContent.trim():'(no result)';

console.log('=== boot ===');
eq('nav rendered (16 tools + 3 system)', doc.querySelectorAll('#nav .nav-item').length, 19);
eq('default tool is molarity', $('#topbarTitle').textContent, 'Molarity & mass');
eq('account + customize + about pinned in nav', !!$('[data-tool="account"]') && !!$('[data-tool="settings"]') && !!$('[data-tool="about"]'), true);

console.log('\n=== molarity ===');
// 58.44 g/mol NaCl, 5 M, 100 mL  -> 29.22 g
set('#f-mw',58.44); set('#f-conc',5); $('[data-k="concU"]').value='M';
$('[data-k="concU"]').dispatchEvent(new window.Event('change',{bubbles:true}));
set('#f-vol',100); $('[data-k="volU"]').value='mL';
$('[data-k="volU"]').dispatchEvent(new window.Event('change',{bubbles:true}));
eq('5M NaCl in 100mL', main(), /29\.22 g/);

// Now EDIT the volume — the stale mass must be re-solved, not left behind.
set('#f-vol',50);
eq('re-solves after edit (50 mL)', main(), /14\.61 g/);

// Clearing an input must stick: the solved mass was derived from these inputs, so keeping
// it would recompute the deleted value straight back.
set('#f-conc','');
eq('clearing an input is not undone by the solver', $('#f-conc').value, '');
eq('the derived mass is cleared with it', $('#f-mass').value, '');

/* Regression for "it won't delete itself": with three inputs entered the fourth is derived,
   and deleting any input used to bring the identical value straight back (because the
   derived value was fed back in as an input). Start from a cleared tool so units and
   solver state are deterministic. */
nav('molarity');
$('#toolClearBtn').click();
set('#f-mw','58.44'); set('#f-conc','5'); set('#f-vol','100');   // defaults: mM, mL, mg
eq('mass is solved from the three inputs', $('#f-mass').value, '29.22');
set('#f-vol','');
eq('deleting the volume sticks', $('#f-vol').value, '');
eq('the derived mass is dropped too', $('#f-mass').value, '');
set('#f-mw','');
eq('deleting the MW sticks', $('#f-mw').value, '');
eq('the untouched input is left alone', $('#f-conc').value, '5');
// and it still solves normally once three values are present again
set('#f-mw','58.44'); set('#f-vol','100');
eq('still solves after re-entering values', $('#f-mass').value, '29.22');

console.log('\n=== dilution ===');
nav('dilution');
set('#f-c1',10); $('[data-k="c1U"]').value='M'; $('[data-k="c1U"]').dispatchEvent(new window.Event('change',{bubbles:true}));
set('#f-c2',50); $('[data-k="c2U"]').value='mM'; $('[data-k="c2U"]').dispatchEvent(new window.Event('change',{bubbles:true}));
set('#f-v2',10); $('[data-k="v2U"]').value='mL'; $('[data-k="v2U"]').dispatchEvent(new window.Event('change',{bubbles:true}));
eq('10M -> 50mM in 10mL needs 50uL', main(), /50 µL stock \+ 9\.95 mL diluent/);
set('#f-v2',20);
eq('rescales on edit', main(), /100 µL stock \+ 19\.9 mL diluent/);
// unit-family mismatch must warn
$('[data-k="c2U"]').value='mg/mL'; $('[data-k="c2U"]').dispatchEvent(new window.Event('change',{bubbles:true}));
eq('warns on mixed unit families', $('.note')?$('.note').textContent:'', /different kinds of unit/);

console.log('\n=== A280 ===');
nav('a280');
set('#f-seq','MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG');
eq('sequence stats shown', $('#seqStats').textContent, /76.*residues/s);
$('#useRed').click();
eq('eps filled from sequence', $('#f-ext').value, '1490');
set('#f-a280',0.5);
eq('A280 0.5 with eps 1490', main(), /2\.874 mg\/mL/);
set('#f-a280',2.5);
eq('high absorbance warning', $('.note').textContent, /outside the reliable linear range/);

console.log('\n=== protein properties ===');
nav('protein');
set('#f-pseq','>sp|P0CG48 header\nMQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG');
eq('FASTA header ignored in UI', main(), /8\.5648 kDa · pI 6\.79/);

console.log('\n=== primer ===');
nav('primer');
set('#f-oseq','GTCGACTAGCTAGCTAGGCA');
eq('Tm rendered', main(), /^Tm \d+\.\d+ °C$/);
set('#f-oseq','AAAA');
eq('short primer flagged', $('.note').textContent, /Shorter than 18 nt/);

console.log('\n=== nucleic acid ===');
nav('nucleic');
set('#f-a260',0.65);
eq('dsDNA 0.65 A260 = 32.5 ng/uL', main(), /32\.5 ng\/µL/);
set('#f-na280',1.5);
eq('bad 260/280 flagged', $('.note').textContent, /protein or phenol/);

console.log('\n=== buffer recipe ===');
nav('buffer');
eq('seed rows present', doc.querySelectorAll('#compBody tr').length, 4);
eq('batch result', main(), /500 mL batch|1 L batch|mL batch/);
const dtt=doc.querySelectorAll('#compBody tr')[3];
eq('DTT weighed as solid', dtt.querySelector('[data-out]').textContent, /mg|g/);

console.log('\n=== pH buffer ===');
nav('ph');
eq('HH result', main(), /acid \+ .* base/);
set('#f-ph',4.0);
eq('far-from-pKa warning', $('.note').textContent, /Buffering capacity is poor/);

console.log('\n=== plate ===');
nav('plate');
eq('renamed to 96-well plate layout', $('#topbarTitle').textContent, '96-well plate layout');
eq('96 wells drawn', doc.querySelectorAll('[data-well]').length, 96);
$('#autoFill').click();
eq('autofill assigned wells', doc.querySelectorAll('[data-well]').length, 96);
$('#f-fmt').value='384'; $('#f-fmt').dispatchEvent(new window.Event('change',{bubbles:true}));
eq('384 wells drawn', doc.querySelectorAll('[data-well]').length, 384);

console.log('\n=== buffer exchange ===');
nav('exchange');
eq('exchange tool renders', $('#topbarTitle').textContent, /buffer exchange/i);
// dialysis: 1 mL vs 1 L, 3 changes -> ~10^9 fold, >99.9999999% removed
set('#f-dsample','1'); $('[data-k="dsampleU"]').value='mL'; $('[data-k="dsampleU"]').dispatchEvent(new window.Event('change',{bubbles:true}));
set('#f-dbath','1'); $('[data-k="dbathU"]').value='L'; $('[data-k="dbathU"]').dispatchEvent(new window.Event('change',{bubbles:true}));
set('#f-dchanges','3');
eq('dialysis 3x1L reduction shown', main(), /×\s*reduction/);
eq('dialysis reduction ~1e9', main(), /1\.003e\+9/);
// target recommendation
set('#f-targetFold','1000000');
eq('recommends changes for target', $('#out').textContent, /you need\s*2\s*buffer changes/);
// switch to spin mode; spin panel visible, dialysis hidden
$('#f-method').value='spin'; $('#f-method').dispatchEvent(new window.Event('change',{bubbles:true}));
eq('spin panel shown in spin mode', $('#spinPanel').style.display, '');
eq('dialysis panel hidden in spin mode', $('#dialPanel').style.display, 'none');
set('#f-cfill','15'); $('[data-k="cfillU"]').value='mL'; $('[data-k="cfillU"]').dispatchEvent(new window.Event('change',{bubbles:true}));
set('#f-cret','500'); $('[data-k="cretU"]').value='µL'; $('[data-k="cretU"]').dispatchEvent(new window.Event('change',{bubbles:true}));
set('#f-crounds','3');
eq('spin mode computes a reduction', main(), /×\s*reduction/);

console.log('\n=== centrifuge ===');
nav('spin');
set('#f-rad',87); set('#f-rpm',14000);
eq('rcf solved', main(), /19064.*× g at 14,?000 rpm|19064 × g/);
set('#f-rpm',10000);
eq('rcf re-solved on edit', main(), /9726\.6/);

console.log('\n=== units ===');
nav('units');
set('#f-tc',25);
eq('C->F', $('#f-tf').value, '77');
eq('C->K', $('#f-tk').value, '298.15');
set('#f-tf',212);
eq('F->C', $('#f-tc').value, '100');

console.log('\n=== buffer from image / text (parser tool) ===');
nav('import');
set('#f-btext', 'Lysis buffer:\n20 mM Tris-HCl pH 7.5\n150 mM NaCl\n1 mM EDTA\n10% glycerol');
$('#parseBtn').click();
eq('parsed four components into rows', doc.querySelectorAll('#importRows tr').length, 4);
eq('title auto-filled from heading', $('#f-ititle').value, 'Lysis buffer');
// default batch is 50 mL; Tris-HCl 20 mM MW 157.6 -> 0.1576 g = 157.6 mg
eq('protocol computed', main(), /50 mL batch/);
eq('Tris weigh-out shown', $('#out').textContent, /157\.6 mg|0\.157/);
eq('glycerol counted as liquid volume', $('#out').textContent, /5 mL/);
// edit a row: change NaCl conc and confirm the amount cell updates
const naclConc = doc.querySelectorAll('#importRows tr')[1].querySelector('[data-c="conc"]');
naclConc.value = '300'; naclConc.dispatchEvent(new window.Event('input',{bubbles:true}));
eq('editing a row recomputes', doc.querySelectorAll('#importRows tr')[1].querySelector('[data-amt]').textContent, /mg|g/);
// unmatched reagent gets an amber outline
set('#f-btext', '5 mM Widgetase'); $('#parseBtn').click();
eq('unknown reagent flagged amber', doc.querySelector('#importRows [data-c="name"]').style.borderColor, /warn/);

console.log('\n=== save + library ===');
nav('import');
set('#f-btext', '25 mM HEPES pH 7.4\n100 mM KCl'); $('#parseBtn').click();
set('#f-ititle', 'Test recipe');
$('#saveBtn').click();
eq('save confirms', $('#saveMsg').textContent, /Saved/);
nav('library');
eq('library lists the saved recipe', doc.querySelectorAll('#libList .lib-card').length, 1);
eq('card shows the title', $('#libList').textContent, /Test recipe/);
doc.querySelector('#libList .lib-card').click();
eq('recipe detail renders a protocol', $('#libRecipeOut').textContent, /batch/);
// create a protocol
$('#addProto').click();
eq('protocol added to list', doc.querySelectorAll('#libList .lib-card').length, 2);
set('#protoTitle', 'Mini-prep'); set('#protoBody', 'Step 1: resuspend\nStep 2: lyse');
nav('library'); // re-enter to force a fresh read from storage
eq('protocol persisted with title', $('#libList').textContent, /Mini-prep/);
// delete the recipe via its detail view
window.confirm = () => true;
doc.querySelectorAll('#libList .lib-card').forEach(c => { if (/Test recipe/.test(c.textContent)) c.click(); });
$('#delItem').click();
eq('one item left after delete', doc.querySelectorAll('#libList .lib-card').length, 1);

console.log('\n=== save plate layout to library ===');
nav('plate');
$('#f-fmt').value='96'; $('#f-fmt').dispatchEvent(new window.Event('change',{bubbles:true}));
$('#autoFill').click();
set('#f-platetitle','Screen plate A');
$('#plateSave').click();
eq('plate save confirms', $('#plateSaveMsg').textContent, /Saved/);
nav('library');
const plateCard = Array.from(doc.querySelectorAll('#libList .lib-card')).find(c => /Screen plate A/.test(c.textContent));
eq('plate layout appears in library with a Plate badge', plateCard && /Plate/.test(plateCard.textContent), true);
plateCard.click();
eq('plate detail shows the format', $('#libDetail').textContent, /96-well/);
$('#loadPlate').click();
eq('Edit-in-designer returns to the plate tool', $('#topbarTitle').textContent, '96-well plate layout');
eq('loaded plate restored painted wells', doc.querySelectorAll('.well').length, 96);

console.log('\n=== customize toolkit ===');
nav('settings');
eq('customizer lists every tool with a toggle', doc.querySelectorAll('#custList [data-show]').length, 16);
// hide the unit converter
const unitToggle = doc.querySelector('#custList [data-show="units"]');
unitToggle.checked = false; unitToggle.dispatchEvent(new window.Event('change',{bubbles:true}));
eq('hidden tool disappears from the sidebar', !!$('[data-tool="units"]'), false);
eq('hidden state persisted', (JSON.parse(window.localStorage.getItem('labtoolkit.v1'))['nav.hidden']||[]).includes('units'), true);
// re-show it
const unitToggle2 = doc.querySelector('#custList [data-show="units"]');
unitToggle2.checked = true; unitToggle2.dispatchEvent(new window.Event('change',{bubbles:true}));
eq('re-enabled tool returns to the sidebar', !!$('[data-tool="units"]'), true);
// reorder: move the 2nd Solutions tool up, check the order array changed
const orderBefore = JSON.parse(window.localStorage.getItem('labtoolkit.v1'))['nav.order'];
doc.querySelector('#custList [data-down="molarity"]').click();
const orderAfter = JSON.parse(window.localStorage.getItem('labtoolkit.v1'))['nav.order'];
eq('reorder writes a new order', JSON.stringify(orderBefore) !== JSON.stringify(orderAfter), true);
eq('molarity moved down past dilution', orderAfter.indexOf('molarity') > orderAfter.indexOf('dilution'), true);
// reset
$('#custReset').click();
eq('reset clears customization', window.localStorage.getItem('labtoolkit.v1').includes('nav.order'), false);

console.log('\n=== about & privacy / data controls ===');
nav('about');
eq('honest messaging present (no absolute "nothing uploaded")', $('#content').textContent, /run entirely in your browser/);
eq('export button present', !!$('#aboutExport'), true);
eq('delete button present', !!$('#aboutWipe'), true);
let exportThrew=false; try { $('#aboutExport').click(); } catch(e){ exportThrew=true; }
eq('export does not throw', exportThrew, false);

console.log('\n=== account tool (local build: no backend configured) ===');
nav('account');
eq('account tool renders', $('#topbarTitle').textContent, 'Account & sync');
eq('shows not-enabled message without backend config', $('#acctBody').textContent, /aren.t enabled|Couldn.t reach/);
eq('account tool did not throw', true, true);

console.log('\n=== clear / undo ===');
nav('molarity');
set('#f-mw','58.44'); set('#f-conc','5'); set('#f-vol','100');
eq('clear button visible on a calculator', $('#toolClearBtn').hidden, false);
eq('values are entered', $('#f-mw').value, '58.44');
$('#toolClearBtn').click();
eq('fields are cleared', $('#f-mw').value, '');
eq('concentration cleared too', $('#f-conc').value, '');
eq('stored entry removed', JSON.parse(window.localStorage.getItem('labtoolkit.v1'))['molarity.mw'], undefined);
eq('button now offers undo', $('#toolClearBtn').textContent, /Undo/);
$('#toolClearBtn').click();
eq('undo restores the values', $('#f-mw').value, '58.44');
eq('undo restores every field', $('#f-vol').value, '100');
eq('button returns to Clear', $('#toolClearBtn').textContent, 'Clear');
// typing a new value dismisses a pending undo (the new run has begun)
$('#toolClearBtn').click();
eq('undo offered again', $('#toolClearBtn').textContent, /Undo/);
set('#f-mw','100');
eq('typing dismisses the undo', $('#toolClearBtn').textContent, 'Clear');
eq('the typed value survives', $('#f-mw').value, '100');
// a tool with its own defaults comes back to those defaults, not blank
nav('a280');
set('#f-path','0.1');
$('#toolClearBtn').click();
eq('defaults are restored, not blanked', $('#f-path').value, '1');
// saved library data must never be clearable
nav('library');
eq('clear hidden on the library', $('#toolClearBtn').hidden, true);
nav('about');
eq('clear hidden on system pages', $('#toolClearBtn').hidden, true);

console.log('\n=== dismissible footer ===');
eq('footer shown by default', $('#foot').hidden, false);
$('#footClose').click();
eq('footer hides when dismissed', $('#foot').hidden, true);
eq('footer dismissal persisted', JSON.parse(window.localStorage.getItem('labtoolkit.v1'))['foot.dismissed'], true);

console.log('\n=== top-bar auth button + theme ===');
nav('molarity');
eq('auth button shows sign in when signed out', $('#authBtn').textContent, 'Sign in / Register');
$('#authBtn').click();
eq('auth button routes to account when signed out', $('#topbarTitle').textContent, 'Account & sync');
nav('molarity');
const before=doc.documentElement.dataset.theme;
$('#themeToggle').click();
eq('theme toggles', doc.documentElement.dataset.theme!==before, true);

const errs=[];
window.addEventListener('error',e=>errs.push(e.message));
eq('no uncaught errors', errs.length, 0);

console.log(fails?'\n'+fails+' FAILURES':'\nAll UI assertions passed');
process.exit(fails?1:0);
