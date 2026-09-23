const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('ui/app.js', 'utf8');
function extract(name) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf('\n  }', start) + 4;
  return source.slice(start, end);
}
const context = vm.createContext({console, performance:{now:()=>100}, Math, Number});
vm.runInContext(`
let state='GUIDING', targetA={x:.625}, targetB={x:.25};
const settings=()=>({baseline:5,fovA:90,fovB:53.13010235415598,requiredFrames:2,tolerance:10});
const track=(cx,w,t)=>({cx,frame_w:w,captured_at:t,receivedAt:100,fresh:true,locked:true,state:'TRACKING'});
let realTrack={A:track(400,640,1),B:track(320,1280,1)};
let alignedFrames=0,prevDirectionalError=null,lastFrame=null,lastCommandedU=0,lastObservationPair=null;
let elapsed=0,closestDistance=Infinity,overshootDetected=false,recording=false;
const trialSamples=[], trialIdInput={value:''};
const hintA={},hintB={},vA={},vB={},vE={},vErr={},vBand={},vU={},vTime={},tolFill={style:{}};
const setStatus=s=>state=s,log=()=>{},recordTrial=()=>{};
${['cameraAngle','triangulate','relativeObjectPosition','unavailableTelemetry','updateTriangulatedTelemetry'].map(extract).join('\n')}
`,context);
function check(expression) { assert.equal(vm.runInContext(expression,context),true,expression); }
check('Math.abs(triangulate(400,320,640,1280).z-10)<1e-6');
check('triangulate(320,640,640,1280)===null');
check('triangulate(NaN,320,640,1280)===null');
check('relativeObjectPosition({x:0,z:10}).distance < 1e-6');
check('Math.abs(relativeObjectPosition({x:3,z:14}).distance - 5) < 1e-6');
check('relativeObjectPosition({x:3,z:14}).lateral < 0 && relativeObjectPosition({x:3,z:14}).forward < 0');
vm.runInContext('realTrack.B.captured_at=1.5;',context);
check('relativeObjectPosition({x:0,z:10})===null');
vm.runInContext('realTrack.B.captured_at=1;',context);
vm.runInContext('updateTriangulatedTelemetry(); updateTriangulatedTelemetry();',context);
check('alignedFrames===1');
vm.runInContext('realTrack.A.captured_at=2;realTrack.B.captured_at=2;updateTriangulatedTelemetry();',context);
check("state==='ALIGNED'");
vm.runInContext('realTrack.B.locked=false;updateTriangulatedTelemetry();',context);
check('relativeObjectPosition({x:0,z:10})===null');
check("state==='GUIDING' && vU.textContent.includes('UNAVAILABLE') && alignedFrames===0");
vm.runInContext('realTrack.B.locked=true; realTrack.A.receivedAt=-2000;updateTriangulatedTelemetry();',context);
check('relativeObjectPosition({x:0,z:10})===null');
check("vU.textContent.includes('UNAVAILABLE')");
vm.runInContext('realTrack.A=null;updateTriangulatedTelemetry();',context);
check('lastObservationPair===null');
console.log('Guidance checks passed: unequal FOV/resolution, invalid rays, distinct observations, loss after alignment, stale polling.');
