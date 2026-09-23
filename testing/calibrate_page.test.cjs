const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const fit=require('../ui/wall-calibration.js');
const elements=new Map(), storage=new Map();
function node(){
  return {value:'',textContent:'',disabled:false,style:{},children:[],events:{},naturalWidth:640,
    appendChild(child){this.children.push(child);},
    replaceChildren(){this.children=[];},querySelectorAll(){return [];},
    addEventListener(name,callback){this.events[name]=callback;},
    getBoundingClientRect(){return {left:0,top:0,width:640,height:480};}};
}
const el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
vm.runInNewContext(fs.readFileSync('ui/calibrate.js','utf8'),{
  document:{getElementById:el,createElement:node},
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
  fitWallCalibration:fit, Date, Math, Number, JSON
});
el('wallBaseline').value='1.25';el('wallDepth').value='3';
assert.equal(el('wallFit').disabled,true);
for(const x of [-.9,-.45,0,.45,.9]){
  const a=.5+(x+.625)/(6*Math.tan(Math.PI/6));
  const b=.5+(x-.625)/(6*Math.tan(80*Math.PI/360));
  el('wallImageA').events.click({clientX:a*640,clientY:240});
  assert.equal(el('wallFit').disabled,true,'Cannot fit a pending unmatched pair');
  el('wallImageB').events.click({clientX:b*640,clientY:240});
}
assert.equal(el('wallFit').disabled,false);
el('wallFit').onclick();
assert.match(el('wallResult').textContent,/60.00°.*80.00°/);
assert.equal(el('wallApply').disabled,false);
assert.equal(storage.size,0,'Fitting must not overwrite calibration');
el('wallApply').onclick();
const saved=JSON.parse(storage.get('aerescueCalibration'));
assert.ok(Math.abs(saved.fovA-60)<1e-8);
assert.ok(Math.abs(saved.fovB-80)<1e-8);
assert.equal(saved.wallCalibration.points.length,5);
el('wallDepth').events.input();
assert.equal(el('wallApply').disabled,true,'Changing measurements invalidates fit');
el('wallUndo').onclick();assert.equal(el('wallFit').disabled,true);
el('wallClear').onclick();assert.equal(el('wallPoints').children.length,0);
el('wallBaseline').value='2.1';el('wallDepth').value='28';
for(const [a,b] of [[.284,.107],[.362,.193],[.419,.287],[.548,.470],[.665,.631],[.811,.814]]){
  el('wallImageA').events.click({clientX:a*640,clientY:240});
  el('wallImageB').events.click({clientX:b*640,clientY:240});
}
el('wallFit').onclick();
assert.equal(el('wallApply').disabled,true);
assert.match(el('wallResult').textContent,/Pair 2/);
assert.match(el('wallPoints').children[1].children[3].textContent,/24.644/);
const before=storage.get('aerescueCalibration');
el('wallApply').onclick();
assert.equal(storage.get('aerescueCalibration'),before,'Rejected diagnostics must not be saved');
console.log('Calibration page checks passed: paired clicks, fit, explicit save, edit invalidation, undo and clear.');
