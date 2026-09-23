const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('ui/app.js', 'utf8');
function extract(name) {
  const start = source.indexOf('  function ' + name + '(');
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
const context = vm.createContext({Math, Number, performance:{now:()=>100}});
vm.runInContext(`
const settings=()=>({baseline:5,fovA:90,fovB:90});
let targetA={x:.625}, targetB={x:.375}, realTrack={A:null,B:null};
const targetDistanceEstimate={}, diagramStatus={};
const dgBaseline={}, dgSideA={}, dgSideB={}, dgRange={}, dgAngleA={}, dgAngleB={},
  dgAngleT={}, dgHeading={}, dgPerpA={}, dgPerpB={}, dgLineDepth={},
  dgObjectDistance={}, dgObjectLateral={}, dgObjectForward={};
const triangleSvg={children:[], appendChild(child){this.children.push(child);},
  set innerHTML(value){this.children=[];}};
const svgEl=(tag,attrs)=>({tag,attrs});
${['cameraAngle','triangulate','relativeObjectPosition','describeArc',
  'resetDiagramReadout','drawEmptyTriangleDiagram','updateTriangleDiagram',
  'updateTargetDistanceDisplay'].map(extract).join('\n')}
updateTargetDistanceDisplay();
`, context);
assert.match(vm.runInContext('targetDistanceEstimate.textContent', context), /10.00 m/);
assert.equal(vm.runInContext('dgRange.textContent', context), '10.00 m');
assert.equal(vm.runInContext('dgObjectDistance.textContent', context), 'Unavailable');
assert.ok(vm.runInContext('triangleSvg.children.some(el=>el.tag === "polygon")', context));
vm.runInContext('targetB={x:.75};updateTargetDistanceDisplay();', context);
assert.match(vm.runInContext('diagramStatus.textContent', context), /Unstable geometry/);
vm.runInContext('targetA=null;updateTargetDistanceDisplay();', context);
assert.match(vm.runInContext('diagramStatus.textContent', context), /Mark the target/);
console.log('Target geometry checks passed without live frame metadata, including invalid/missing marks.');
