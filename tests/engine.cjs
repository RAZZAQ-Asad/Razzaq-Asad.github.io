const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../assets/engine.js'),'utf8');
vm.runInThisContext(code);
assert.deepEqual(normalizeGenes({s:4,c:253.8,k:4,p:.853}),{s:4,c:250,k:4,p:.85});
assert.equal(points(fitness({pk:[{delivered:true},{delivered:true},{delivered:true}],done:'goal',t:1800})),75);
assert.equal(points(fitness({pk:[{delivered:true},{delivered:true},{delivered:true}],done:'goal',t:3600})),50);
assert.deepEqual(newEvo('warehouse').pop,newEvo('warehouse').pop);
assert.ok(HOLDOUT_SEEDS.every(seed=>!EVAL_SEEDS.includes(seed)));
for (const key of Object.keys(SCENARIOS)) {
 for (const scouts of [0,4,9]) {
  const g = {s:scouts,c:250,k:4,p:.85};
  const w = makeWorld(g,3,key);
  assert.equal(w.pk.length,3);
  assert.ok(scouts*COST.scout+workersFor(scouts)*COST.worker<=BUDGET);
  for(let i=0;i<100;i++)step(w);
  assert.ok(w.robots.every(r=>Number.isFinite(r.x)&&Number.isFinite(r.y)&&r.bat>=0));
 }
 const g={s:4,c:250,k:4,p:.85};
 const a=simulate(g,23,key), b=simulate(g,23,key);
 assert.deepEqual(a,b);
 assert.ok(a.f>=0&&a.f<=2&&a.cov>=0&&a.cov<=1);
 console.log(key+': deterministic full mission passed ('+points(a.f)+' points)');
}
console.log('Scoring, budget, normalization, repeatability and scenario checks passed.');

