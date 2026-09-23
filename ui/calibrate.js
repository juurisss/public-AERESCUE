(() => {
  const el=id=>document.getElementById(id);
  const baseline=el('wallBaseline'), depth=el('wallDepth'), status=el('wallStatus');
  const result=el('wallResult'), fit=el('wallFit'), apply=el('wallApply');
  const images={a:el('wallImageA'),b:el('wallImageB')};
  const views={a:el('wallViewA'),b:el('wallViewB')};
  let points=[], pending=null, estimate=null;
  function saved(){
    try { return JSON.parse(localStorage.getItem('aerescueCalibration')) || {}; }
    catch { return {}; }
  }
  baseline.value=saved().baseline || 5;

  function invalidate(){
    estimate=null;
    apply.disabled=true;
    result.textContent='Collect at least five pairs, then estimate HFOV. Existing calibration has not changed.';
  }
  function render(){
    for(const view of Object.values(views)) view.querySelectorAll('.wall-point').forEach(p=>p.remove());
    const marker=(which,point,label,isPending=false)=>{
      const dot=document.createElement('span');
      dot.className='wall-point' + (isPending ? ' pending' : '');
      dot.style.left=point.x*100+'%'; dot.style.top=point.y*100+'%';
      dot.textContent=label; views[which].appendChild(dot);
    };
    points.forEach((p,i)=>{marker('a',p.a,i+1);marker('b',p.b,i+1);});
    if(pending) marker('a',pending,points.length+1,true);
    el('wallPoints').replaceChildren();
    points.forEach((p,i)=>{
      const row=document.createElement('tr');
      for(const value of [i+1, (p.a.x*100).toFixed(1)+'%', (p.b.x*100).toFixed(1)+'%',
        estimate ? estimate.depths[i].toFixed(3)+' m' : '—',
        estimate ? (estimate.errors[i]>=0 ? '+' : '')+(100*estimate.errors[i]/Number(depth.value)).toFixed(1)+'%' : '—']){
        const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);
      }
      if(estimate && Math.abs(estimate.errors[i]/Number(depth.value)) > 0.05) row.className='wall-mismatch';
      const cell=document.createElement('td'), remove=document.createElement('button');
      remove.textContent='Remove '+(i+1);
      remove.onclick=()=>{points.splice(i,1);pending=null;invalidate();render();};
      cell.appendChild(remove);row.appendChild(cell);el('wallPoints').appendChild(row);
    });
    fit.disabled=points.length<5 || Boolean(pending);
    status.textContent=points.length+' pairs collected. '+(pending
      ? 'Click the SAME wall point in Camera B. Click Camera A again to adjust the pending point.'
      : 'Click a new wall point in Camera A, then match it in Camera B.');
  }
  function click(which,event){
    const image=images[which];
    if(!image.naturalWidth){status.textContent='Start camera previews in the console first.';return;}
    const rect=image.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    const point={x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
      y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
    if(which==='a') pending=point;
    else if(pending){points.push({a:pending,b:point});pending=null;}
    else {status.textContent='Select the point in Camera A first.';return;}
    invalidate();render();
  }
  Object.entries(images).forEach(([which,image])=>{
    image.addEventListener('click',event=>click(which,event));
    image.addEventListener('error',()=>{status.textContent='Camera '+which.toUpperCase()+' is unavailable. Start its preview in the console, then reconnect previews.';});
  });
  function reconnect(){
    Object.entries(images).forEach(([which,image])=>{image.src='/api/video/'+which.toUpperCase()+'?t='+Date.now();});
  }
  el('wallReconnect').onclick=reconnect;
  el('wallUndo').onclick=()=>{if(pending) pending=null;else points.pop();invalidate();render();};
  el('wallClear').onclick=()=>{points=[];pending=null;invalidate();render();};
  [baseline,depth].forEach(input=>input.addEventListener('input',()=>{invalidate();render();}));
  fit.onclick=()=>{
    invalidate();
    try {
      estimate=fitWallCalibration(points.map(p=>({a:p.a.x,b:p.b.x})),Number(baseline.value),Number(depth.value));
      render();
      result.textContent='Camera A HFOV: '+estimate.fovA.toFixed(2)+'° · Camera B HFOV: '+estimate.fovB.toFixed(2)+
        '° · Wall-depth fit RMS: '+estimate.rms.toFixed(3)+' m · Maximum error: '+estimate.maxError.toFixed(3)+' m.';
      apply.disabled=false;
    } catch(error){
      if(error.diagnostic){
        estimate=error.diagnostic;
        render();
        const worst=estimate.errors.reduce((best,value,i)=>Math.abs(value)>Math.abs(estimate.errors[best])?i:best,0);
        result.textContent=error.message+' Diagnostic HFOVs only: A '+estimate.fovA.toFixed(2)+'°, B '+estimate.fovB.toFixed(2)+
          '°. Pair '+(worst+1)+' has the largest depth mismatch. Recheck that feature in both views; if several pairs disagree, check the camera and wall alignment. Calibration has not been saved.';
      } else result.textContent=error.message;
    }
  };
  apply.onclick=()=>{
    if(!estimate?.accepted) return;
    const calibration={...saved(),baseline:Number(baseline.value),fovA:estimate.fovA,fovB:estimate.fovB,
      tolerance:saved().tolerance || 10,savedAt:new Date().toISOString(),
      wallCalibration:{depth:Number(depth.value),points,rms:estimate.rms,maxError:estimate.maxError}};
    try {
      localStorage.setItem('aerescueCalibration',JSON.stringify(calibration));
      status.textContent='Calibration saved. Return to the console at this same address; both HFOVs update automatically.';
      apply.disabled=true;
    } catch {status.textContent='Browser storage is unavailable. Copy the HFOV values into the console manually.';}
  };
  render();reconnect();
})();
