/* Tests the pure sync-reconciliation logic (mergeItems) that decides what wins between a
   device's local library and the encrypted rows pulled from the server.
   Run: npm run test:sync
   Slices the DOM-free layer out of app.js (everything before `const TOOLS`). */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const cut = src.indexOf('const TOOLS = {}');
const tmp = path.join(__dirname, '.sync.test.js');
fs.writeFileSync(tmp, src.slice(0, cut) + 'module.exports = { mergeItems };');
const { mergeItems } = require(tmp);
process.on('exit', () => { try { fs.unlinkSync(tmp); } catch {} });

let fails = 0;
const ok = (name, cond) => { if (cond) console.log('ok  ', name); else { fails++; console.log('FAIL', name); } };

const L = (id, t, extra = {}) => ({ id, kind: 'recipe', title: t, createdAt: t, updatedAt: t, ...extra });
const R = (id, updatedAt, item, deleted = false) => ({ id, kind: 'recipe', updatedAt, deleted, item });

console.log('--- brand new local item, empty server ---');
{
  const { merged, toPush } = mergeItems([L('a', 100)], []);
  ok('kept locally', merged.length === 1 && merged[0].id === 'a');
  ok('queued for push', toPush.length === 1 && toPush[0].id === 'a');
}

console.log('--- server has an item this device has never seen ---');
{
  const { merged, toPush } = mergeItems([], [R('b', 200, L('b', 200))]);
  ok('pulled into local', merged.length === 1 && merged[0].id === 'b');
  ok('not re-pushed', toPush.length === 0);
}

console.log('--- same item, remote newer wins ---');
{
  const { merged, toPush } = mergeItems([L('c', 100, { title: 'old' })], [R('c', 300, L('c', 300, { title: 'new' }))]);
  ok('remote version kept', merged[0].title === 'new');
  ok('not pushed (remote already newest)', toPush.length === 0);
}

console.log('--- same item, local newer wins and is pushed ---');
{
  const { merged, toPush } = mergeItems([L('d', 500, { title: 'local-new' })], [R('d', 200, L('d', 200, { title: 'remote-old' }))]);
  ok('local version kept', merged[0].title === 'local-new');
  ok('local pushed up', toPush.length === 1 && toPush[0].id === 'd');
}

console.log('--- remote tombstone newer than local -> item removed ---');
{
  const { merged } = mergeItems([L('e', 100)], [R('e', 400, null, true)]);
  ok('deleted locally', merged.length === 0);
}

console.log('--- remote tombstone OLDER than a local edit -> local survives & re-pushed ---');
{
  const { merged, toPush } = mergeItems([L('f', 900, { title: 'revived' })], [R('f', 300, null, true)]);
  ok('local edit wins over stale delete', merged.length === 1 && merged[0].title === 'revived');
  ok('re-pushed to undo the stale tombstone', toPush.some(i => i.id === 'f'));
}

console.log('--- ordering: merged sorted by createdAt desc ---');
{
  const { merged } = mergeItems([L('x', 100), L('z', 300)], [R('y', 200, L('y', 200))]);
  ok('newest-created first', merged.map(i => i.id).join(',') === 'z,y,x');
}

console.log('--- mixed realistic round: two devices ---');
{
  // local has A(new), B(old); server has B(new), C
  const local = [L('A', 500), L('B', 100)];
  const remote = [R('B', 400, L('B', 400, { title: 'B-server' })), R('C', 450, L('C', 450))];
  const { merged, toPush } = mergeItems(local, remote);
  const ids = merged.map(i => i.id).sort().join(',');
  ok('union of all live items', ids === 'A,B,C');
  ok('B resolved to server (newer)', merged.find(i => i.id === 'B').title === 'B-server');
  ok('only A pushed (local-only)', toPush.map(i => i.id).sort().join(',') === 'A');
}

console.log(fails ? `\n${fails} FAILURES` : '\nAll sync assertions passed');
process.exit(fails ? 1 : 0);
