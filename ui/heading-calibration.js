(() => {
  const el = id => document.getElementById(id);
  const baseline = el('headingBaseline');
  const fovA = el('headingFovA');
  const fovB = el('headingFovB');
  const depth = el('headingDepth');
  const status = el('headingStatus');
  const result = el('headingResult');
  const fit = el('headingFit');
  const apply = el('headingApply');
  const images = {a: el('headingImageA'), b: el('headingImageB')};
  const views = {a: el('headingViewA'), b: el('headingViewB')};
  let points = [], pending = null, estimate = null;

  function saved(){
    try { return JSON.parse(localStorage.getItem('aerescueCalibration')) || {}; }
    catch { return {}; }
  }

  const previous = saved();
  baseline.value = previous.baseline || 5;
  fovA.value = previous.fovA || 90;
  fovB.value = previous.fovB || 90;

  function invalidate(){
    estimate = null;
    apply.disabled = true;
    result.textContent = 'Collect at least three matching pairs; five or more are recommended.';
  }

  function render(){
    Object.values(views).forEach(view => view.querySelectorAll('.wall-point').forEach(point => point.remove()));
    const marker = (which, point, label, pendingMarker = false) => {
      const dot = document.createElement('span');
      dot.className = 'wall-point' + (pendingMarker ? ' pending' : '');
      dot.style.left = point.x * 100 + '%';
      dot.style.top = point.y * 100 + '%';
      dot.textContent = label;
      views[which].appendChild(dot);
    };
    points.forEach((point, index) => {
      marker('a', point.a, index + 1);
      marker('b', point.b, index + 1);
    });
    if(pending) marker('a', pending, points.length + 1, true);
    el('headingPoints').replaceChildren();
    points.forEach((point, index) => {
      const row = document.createElement('tr');
      const residual = estimate?.residuals[index];
      const flagged = estimate?.flagged[index];
      const values = [
        index + 1,
        point.z.toFixed(2) + ' m',
        (point.a.x * 100).toFixed(1) + '%',
        (point.b.x * 100).toFixed(1) + '%',
        Number.isFinite(residual) ? (residual >= 0 ? '+' : '') + residual.toFixed(3) + ' m' : '—',
        Number.isFinite(residual) ? (flagged ? 'CHECK' : 'OK') : '—'
      ];
      values.forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      if(flagged) row.className = 'wall-mismatch';
      const cell = document.createElement('td');
      const remove = document.createElement('button');
      remove.textContent = 'Remove ' + (index + 1);
      remove.onclick = () => { points.splice(index, 1); pending = null; invalidate(); render(); };
      cell.appendChild(remove);
      row.appendChild(cell);
      el('headingPoints').appendChild(row);
    });
    fit.disabled = points.length < 3 || Boolean(pending);
    status.textContent = points.length + ' pairs collected. ' + (pending
      ? 'Click the SAME physical feature in Camera B. Click Camera A again to adjust the pending point.'
      : 'Enter the next point depth, then click a new feature in Camera A.');
  }

  function click(which, event){
    const image = images[which];
    if(!image.naturalWidth){ status.textContent = 'Start camera previews in the console first.'; return; }
    const rect = image.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
    if(which === 'a'){
      const z = Number(depth.value);
      if(!Number.isFinite(z) || z <= 0){ status.textContent = 'Enter this point\'s positive perpendicular depth first.'; return; }
      pending = {...point, z};
    } else if(pending){
      points.push({a:{x:pending.x, y:pending.y}, b:point, z:pending.z});
      pending = null;
    } else { status.textContent = 'Select the point in Camera A first.'; return; }
    invalidate();
    render();
  }

  Object.entries(images).forEach(([which, image]) => {
    image.addEventListener('click', event => click(which, event));
    image.addEventListener('error', () => {
      status.textContent = 'Camera ' + which.toUpperCase() + ' is unavailable. Start its preview in the console, then reconnect previews.';
    });
  });

  function reconnect(){
    Object.entries(images).forEach(([which, image]) => {
      image.src = '/api/video/' + which.toUpperCase() + '?t=' + Date.now();
    });
  }

  el('headingReconnect').onclick = reconnect;
  el('headingUndo').onclick = () => { if(pending) pending = null; else points.pop(); invalidate(); render(); };
  el('headingClear').onclick = () => { points = []; pending = null; invalidate(); render(); };
  [baseline, fovA, fovB, depth].forEach(input => input.addEventListener('input', () => { invalidate(); render(); }));

  fit.onclick = () => {
    invalidate();
    try {
      estimate = fitHeadingCalibration(points.map(point => ({a:point.a.x, b:point.b.x, z:point.z})),
        Number(baseline.value), Number(fovA.value), Number(fovB.value));
      render();
      result.textContent = estimate.pointCount + ' points · Camera A heading: ' + estimate.phiA.toFixed(2) + '° · Camera B heading: ' +
        estimate.phiB.toFixed(2) + '° · Relative difference: ' + estimate.relativeHeading.toFixed(2) +
        '° · RMSE: ' + estimate.rmse.toFixed(3) + ' m · Maximum residual: ' + estimate.maxResidual.toFixed(3) +
        ' m. ' + (estimate.flagged.some(Boolean) ? 'CHECK flagged pairs.' : 'Residuals are within the review threshold.');
      apply.disabled = false;
    } catch(error) {
      result.textContent = error.message;
    }
  };

  apply.onclick = () => {
    if(!estimate) return;
    const calibration = {
      ...saved(),
      baseline: Number(baseline.value),
      fovA: Number(fovA.value),
      fovB: Number(fovB.value),
      phiA: estimate.phiA,
      phiB: estimate.phiB,
      cameraHeadingCalibration: {
        points,
        phiA: estimate.phiA,
        phiB: estimate.phiB,
        relativeHeading: estimate.relativeHeading,
        residuals: estimate.residuals,
        rmse: estimate.rmse,
        maxResidual: estimate.maxResidual,
        pointCount: estimate.pointCount,
        flagged: estimate.flagged,
        savedAt: new Date().toISOString()
      },
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem('aerescueCalibration', JSON.stringify(calibration));
      status.textContent = 'Heading calibration saved. Return to the console; both camera offsets update automatically.';
      apply.disabled = true;
    } catch { status.textContent = 'Browser storage is unavailable. Calibration was not saved.'; }
  };

  render();
  reconnect();
})();
