const assert=require('node:assert/strict');
const fit=require('../ui/wall-calibration.js');
function pointsFor(fovA,fovB,baseline,depth){
  const ta=Math.tan(fovA*Math.PI/360),tb=Math.tan(fovB*Math.PI/360);
  return [-.9,-.45,0,.45,.9].map(x=>({a:.5+(x+baseline/2)/(2*depth*ta),b:.5+(x-baseline/2)/(2*depth*tb)}));
}
for(const [a,b] of [[60,80],[90,90],[110,55]]){
  const result=fit(pointsFor(a,b,1.25,3),1.25,3);
  assert.ok(Math.abs(result.fovA-a)<1e-8);
  assert.ok(Math.abs(result.fovB-b)<1e-8);
  assert.ok(result.rms<1e-10);
}
const points=pointsFor(60,80,1.25,3);
const noisy=points.map((p,i)=>({a:p.a+[0,.001,-.001,.002,-.002][i],b:p.b}));
const estimated=fit(noisy,1.25,3);
assert.ok(Math.abs(estimated.fovA-60)<1);
assert.ok(Math.abs(estimated.fovB-80)<1);
assert.throws(()=>fit(points.slice(0,4),1.25,3),/five/);
assert.throws(()=>fit(points,0,3),/positive/);
assert.throws(()=>fit(points,1.25,NaN),/positive/);
assert.throws(()=>fit(Array(5).fill(points[0]),1.25,3),/Spread/);
assert.throws(()=>fit(points.map(p=>({a:p.a,b:p.a})),1.25,3),/reliably/);
assert.throws(()=>fit(points.map(p=>({a:p.b,b:p.a})),1.25,3),/plausible/);
assert.throws(()=>fit(points.map((p,i)=>i===2?{...p,b:.95}:p),1.25,3),/disagree|plausible|behind/);
console.log('Wall calibration checks passed: known unequal/equal HFOVs, noisy clicks, missing/degenerate/mismatched points.');
const reported=[[.284,.107],[.362,.193],[.419,.287],[.548,.470],[.665,.631],[.811,.814]].map(([a,b])=>({a,b}));
assert.throws(()=>fit(reported,2.1,28),error=>{
  assert.equal(error.diagnostic.accepted,false);
  assert.equal(error.diagnostic.depths.length,6);
  assert.ok(Math.abs(error.diagnostic.depths[1]-24.6444)<.001);
  assert.ok(error.diagnostic.rms/28>.08);
  return true;
});
