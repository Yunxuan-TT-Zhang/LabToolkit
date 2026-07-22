/* Tests the recipe parser: free text / OCR output -> structured components -> protocol.
   Run: npm run test:parse
   Slices the DOM-free calculation layer out of app.js (everything before `const TOOLS`). */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const cut = src.indexOf('const TOOLS = {}');
const tmp = path.join(__dirname, '.parse.test.js');
fs.writeFileSync(tmp, src.slice(0, cut) +
  'module.exports={parseBufferText,parseComponentLine,matchReagent,normalizeUnit,componentAmount,computeRecipe,showMass,showVol};');
const C = require(tmp);
process.on('exit', () => { try { fs.unlinkSync(tmp); } catch {} });

let fails = 0;
function eq(name, got, want, tol = 0) {
  let good;
  if (typeof want === 'number') good = Math.abs(got - want) <= (tol || 1e-9) * Math.max(1, Math.abs(want));
  else good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) { fails++; console.log('FAIL', name, '\n  got :', JSON.stringify(got), '\n  want:', JSON.stringify(want)); }
  else console.log('ok  ', name);
}

console.log('--- unit normalisation ---');
eq('mM', C.normalizeUnit('mM'), 'mM');
eq('uM -> µM', C.normalizeUnit('uM'), 'µM');
eq('µM stays', C.normalizeUnit('µM'), 'µM');
eq('M', C.normalizeUnit('M'), 'M');
eq('% (v/v)', C.normalizeUnit('% (v/v)'), '% v/v');
eq('%w/v', C.normalizeUnit('%w/v'), '% w/v');
eq('bare %', C.normalizeUnit('%'), '%');
eq('x -> X', C.normalizeUnit('x'), 'X');
eq('mg/ml -> mg/mL', C.normalizeUnit('mg/ml'), 'mg/mL');

console.log('\n--- reagent matching ---');
eq('NaCl', C.matchReagent('NaCl').name, 'NaCl');
eq('sodium chloride', C.matchReagent('sodium chloride').name, 'NaCl');
eq('Tris alone -> Tris base', C.matchReagent('Tris').name, 'Tris base');
eq('Tris-HCl -> Tris·HCl', C.matchReagent('Tris-HCl').name, 'Tris·HCl');
eq('Trizma base', C.matchReagent('Trizma base').name, 'Tris base');
eq('EDTA', C.matchReagent('EDTA').name, 'EDTA');
eq('imidazole caps-insensitive', C.matchReagent('IMIDAZOLE').name, 'Imidazole');
eq('MgCl2 formula', C.matchReagent('MgCl2').name, 'MgCl₂');
eq('β-ME synonym', C.matchReagent('BME').name, 'β-mercaptoethanol');
eq('gibberish -> null', C.matchReagent('unobtanium'), null);
eq('MW carried through', C.matchReagent('HEPES').mw, 238.30, 1e-4);

console.log('\n--- single line parsing ---');
{
  const c = C.parseComponentLine('20 mM Tris-HCl pH 7.5');
  eq('conc', c.conc, 20);
  eq('unit', c.unit, 'mM');
  eq('pH captured', c.pH, 7.5);
  eq('name matched', c.name, 'Tris·HCl');
  eq('mw from table', c.mw, 157.60, 1e-4);
}
eq('name-first order', C.parseComponentLine('NaCl 150 mM').conc, 150);
eq('name-first unit', C.parseComponentLine('NaCl 150 mM').name, 'NaCl');
eq('decimal molar', C.parseComponentLine('0.5 M imidazole').conc, 0.5);
eq('molar unit not eaten by MgCl2', C.parseComponentLine('2 mM MgCl2').unit, 'mM');
eq('list marker stripped', C.parseComponentLine('- 1 mM DTT').name, 'DTT');
eq('numbered marker stripped', C.parseComponentLine('3) 10% glycerol').conc, 10);
eq('percent glycerol unit', C.parseComponentLine('10% glycerol').unit, '%');
eq('unmatched keeps typed name', C.parseComponentLine('5 mM Widgetase').name, 'Widgetase');
eq('unmatched flagged', C.parseComponentLine('5 mM Widgetase').matched, false);
eq('blank line -> null', C.parseComponentLine('   '), null);

console.log('\n--- multi-line block (a realistic paste) ---');
{
  const text = `Lysis buffer:
20 mM Tris-HCl pH 7.5
150 mM NaCl
1 mM EDTA
1 mM DTT
10% glycerol
0.1% Triton X-100`;
  const res = C.parseBufferText(text);
  eq('title captured', res.title, 'Lysis buffer');
  eq('six components', res.components.length, 6);
  eq('all but none unmatched', res.components.filter(c => !c.matched).length, 0);
  eq('Triton recognised as liquid', res.components[5].phys, 'liquid');
}

console.log('\n--- amount computation for a 1 L batch ---');
{
  // 150 mM NaCl, MW 58.44, 1 L -> 8.766 g
  const nacl = { name: 'NaCl', conc: 150, unit: 'mM', mw: 58.44, pH: null, phys: 'solid' };
  const a = C.componentAmount(nacl, 1);
  eq('NaCl mass kind', a.kind, 'mass');
  eq('NaCl 150 mM in 1 L = 8.766 g', a.value, 8.766, 1e-3);

  // 10% v/v glycerol in 1 L -> 100 mL
  const gly = { name: 'Glycerol', conc: 10, unit: '%', mw: 92.09, pH: null, phys: 'liquid' };
  const g = C.componentAmount(gly, 1);
  eq('glycerol is a volume', g.kind, 'volume');
  eq('10% v/v in 1 L = 0.1 L', g.value, 0.1, 1e-9);

  // 5% w/v sucrose in 1 L -> 50 g
  const suc = { name: 'Sucrose', conc: 5, unit: '% w/v', mw: 342.3, pH: null, phys: 'solid' };
  eq('5% w/v in 1 L = 50 g', C.componentAmount(suc, 1).value, 50, 1e-9);

  // molar with no MW -> note, not a silent zero
  eq('missing MW -> note', C.componentAmount({ conc: 1, unit: 'mM', mw: null, phys: 'solid' }, 1).kind, 'note');
  // no unit -> note
  eq('no unit -> note', C.componentAmount({ conc: 1, unit: null, mw: 10, phys: 'solid' }, 1).kind, 'note');
}

console.log('\n--- full recipe protocol ---');
{
  const res = C.parseBufferText('20 mM Tris-HCl pH 7.5\n150 mM NaCl\n10% glycerol');
  const out = C.computeRecipe(res.components, 0.5);   // 500 mL
  eq('three protocol lines', out.lines.length, 3);
  // glycerol 10% v/v of 500 mL = 50 mL = 0.05 L counted as used liquid volume
  eq('used liquid volume', out.usedVol, 0.05, 1e-9);
  eq('water to volume', out.water, 0.45, 1e-9);
  eq('not overdrawn', out.overdrawn, false);
}
{
  // overdrawn: two 60% v/v liquids need 12 mL of a 10 mL batch
  const out = C.computeRecipe([
    { name: 'Glycerol', conc: 60, unit: '%', mw: 92.09, phys: 'liquid' },
    { name: 'DMSO', conc: 60, unit: '%', mw: 78.13, phys: 'liquid' },
  ], 0.01);
  eq('overdrawn detected', out.overdrawn, true);
}

console.log(fails ? `\n${fails} FAILURES` : '\nAll parser assertions passed');
process.exit(fails ? 1 : 0);
