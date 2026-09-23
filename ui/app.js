(function(){

  const STREAM_URL_A = '/api/video/A';
  const STREAM_URL_B = '/api/video/B';

  const streamA = document.getElementById('streamA');
  const streamB = document.getElementById('streamB');

  const wrapA = document.getElementById('wrapA');
  const wrapB = document.getElementById('wrapB');
  let streamRetryTimer = null;
  let streamRetryCount = 0;


  function showReferenceLine(which, x){

    const wrap = which === 'A' ? wrapA : wrapB;

    if(!wrap){
      return;
    }

    wrap.querySelector('.target-reference-line')?.remove();

    const line = document.createElement('div');
    line.className = 'target-reference-line';
    line.style.left = x + '%';
    wrap.appendChild(line);
  }


  function hideReferenceLines(){

    [wrapA, wrapB].forEach(wrap => {
      wrap?.querySelector('.target-reference-line')?.remove();
    });
  }


  function showLiveStream(){

    const url =
      STREAM_URL_A + '?t=' + Date.now();
    const urlB =
      STREAM_URL_B + '?t=' + Date.now();

    if(streamA){

      streamA.onerror = () => {
        retryLiveStream();

      };

      streamA.src = url;

      if(wrapA){
        wrapA.classList.add('live');
      }
    }


    if(streamB){

      streamB.onerror = () => {
        retryLiveStream();

      };

      streamB.src = urlB;

      if(wrapB){
        wrapB.classList.add('live');
      }
    }


    log(
      'Live MJPEG stream attached to camera feeds.',
      'hit'
    );
  }


  function hideLiveStream(){

    if(streamRetryTimer){
      clearTimeout(streamRetryTimer);
      streamRetryTimer = null;
    }

    streamRetryCount = 0;

    if(streamA){

      streamA.onerror = null;
      streamA.removeAttribute('src');
    }

    if(streamB){

      streamB.onerror = null;
      streamB.removeAttribute('src');
    }

    if(wrapA){
      wrapA.classList.remove('live');
    }

    if(wrapB){
      wrapB.classList.remove('live');
    }
  }


  function retryLiveStream(){

    if(streamRetryTimer || streamRetryCount >= 20){
      return;
    }

    streamRetryTimer = setTimeout(() => {
      streamRetryTimer = null;
      streamRetryCount += 1;
      showLiveStream();
    }, 500);
  }


  const statusPill =
    document.getElementById('statusPill');

  const statusLabel =
    document.getElementById('statusLabel');

  const btnLaunch =
    document.getElementById('btnLaunch');

  const btnReset =
    document.getElementById('btnReset') ||
    document.getElementById('btnStop');

  const btnRescan =
    document.getElementById('btnRescan');


  const selectA =
    document.getElementById('selectA') ||
    document.getElementById('camSelect');

  const selectB =
    document.getElementById('selectB');


  const hintA =
    document.getElementById('hintA');

  const hintB =
    document.getElementById('hintB');


  const logEl =
    document.getElementById('log');


  const vA =
    document.getElementById('vA');

  const vB =
    document.getElementById('vB');

  const vE =
    document.getElementById('vE');

  const vErr =
    document.getElementById('vErr');

  const vBand =
    document.getElementById('vBand');

  const vU =
    document.getElementById('vU');

  const vTime =
    document.getElementById('vTime');

  const tolFill =
    document.getElementById('tolFill');

  const cameraDistanceInput = document.getElementById('cameraDistance');
  const fovAInput = document.getElementById('fovA');
  const fovBInput = document.getElementById('fovB');
  const requiredFramesInput = document.getElementById('requiredFrames');
  const alignmentToleranceInput = document.getElementById('alignmentTolerance');
  const lateralToleranceInput = document.getElementById('lateralTolerance');
  const stoppingDistanceToleranceInput = document.getElementById('stoppingDistanceTolerance');
  const targetDistanceInput = document.getElementById('targetDistance');
  const trialIdInput = document.getElementById('trialId');
  const btnCalibrate = document.getElementById('btnCalibrate');
  const calibrationStatus = document.getElementById('calibrationStatus');
  const targetDistanceEstimate = document.getElementById('targetDistanceEstimate');
  const btnRecord = document.getElementById('btnRecord');
  const recordingStatus = document.getElementById('recordingStatus');
  const btnExport = document.getElementById('btnExport');
  const trialCountEl = document.getElementById('trialCount');
  const successRateEl = document.getElementById('successRate');
  const meanClosestEl = document.getElementById('meanClosest');

  const triangleSvg = document.getElementById('triangleSvg');
  const diagramStatus = document.getElementById('diagramStatus');
  const dgBaseline = document.getElementById('dgBaseline');
  const dgSideA = document.getElementById('dgSideA');
  const dgSideB = document.getElementById('dgSideB');
  const dgRange = document.getElementById('dgRange');
  const dgAngleA = document.getElementById('dgAngleA');
  const dgAngleB = document.getElementById('dgAngleB');
  const dgAngleT = document.getElementById('dgAngleT');
  const dgHeading = document.getElementById('dgHeading');
  const dgPerpA = document.getElementById('dgPerpA');
  const dgPerpB = document.getElementById('dgPerpB');
  const dgLineDepth = document.getElementById('dgLineDepth');
  const dgObjectDistance = document.getElementById('dgObjectDistance');
  const dgObjectLateral = document.getElementById('dgObjectLateral');
  const dgObjectForward = document.getElementById('dgObjectForward');
  const midpointDisplacement = document.getElementById('midpointDisplacement');
  const perpendicularDistance = document.getElementById('perpendicularDistance');

  function relativeObjectPosition(target){
    const a = realTrack.A, b = realTrack.B;
    const usable = track => track?.fresh && track.locked &&
      Number.isFinite(track.captured_at) && Number.isFinite(track.receivedAt) &&
      performance.now() - track.receivedAt < 1000;
    if(!usable(a) || !usable(b) || Math.abs(a.captured_at - b.captured_at) > 0.25) return null;
    const position = triangulate(a.cx, b.cx, a.frame_w, b.frame_w);
    if(!position) return null;
    const lateral = position.x - target.x;
    const forward = position.z - target.z;
    return {position, lateral, forward, distance: Math.hypot(lateral, forward)};
  }


  let state = 'STANDBY';

  let targetA = null;
  let targetB = null;

  let lastCamList = [];

  let elapsed = 0;
  let t = 0;
  let lastFrame = null;

  const APPROACH_OFFSET = 150;
  const trialRecords = [];
  const trialSamples = [];
  let recording = false;
  let calibrationRaw = localStorage.getItem('aerescueCalibration');
  let calibration = calibrationRaw ? JSON.parse(calibrationRaw) : null;
  let alignedFrames = 0;
  let overshootDetected = false;
  let closestDistance = Infinity;
  let lastObservationPair = null;

  function settings(){
    return {
      baseline: Number(cameraDistanceInput?.value ?? 5),
      fovA: Number(fovAInput?.value ?? 90),
      fovB: Number(fovBInput?.value ?? 90),
      phiA: Number(calibration?.phiA ?? 0),
      phiB: Number(calibration?.phiB ?? 0),
      requiredFrames: Math.max(1, Number(requiredFramesInput?.value) || 5),
      tolerance: Math.max(1, Number(alignmentToleranceInput?.value) || 10),
      epsilonX: Number.isFinite(Number(lateralToleranceInput?.value)) && Number(lateralToleranceInput?.value) >= 0 ? Number(lateralToleranceInput.value) : 3,
      epsilonD: Number.isFinite(Number(stoppingDistanceToleranceInput?.value)) && Number(stoppingDistanceToleranceInput?.value) >= 0 ? Number(stoppingDistanceToleranceInput.value) : 3
    };
  }

  function loadCalibration(){
    if(!calibration) return;
    if(cameraDistanceInput) cameraDistanceInput.value = calibration.baseline;
    if(fovAInput) fovAInput.value = calibration.fovA;
    if(fovBInput) fovBInput.value = calibration.fovB;
    if(alignmentToleranceInput) alignmentToleranceInput.value = calibration.tolerance;
    if(lateralToleranceInput && Number.isFinite(calibration.epsilonX) && calibration.epsilonX >= 0) lateralToleranceInput.value = calibration.epsilonX;
    if(stoppingDistanceToleranceInput && Number.isFinite(calibration.epsilonD) && calibration.epsilonD >= 0) stoppingDistanceToleranceInput.value = calibration.epsilonD;
    if(calibrationStatus) calibrationStatus.textContent = 'Calibration loaded from ' + new Date(calibration.savedAt).toLocaleString() +
      (Number.isFinite(calibration.phiA) && Number.isFinite(calibration.phiB) ? '. Heading offsets: A ' + calibration.phiA.toFixed(2) + 'Â°, B ' + calibration.phiB.toFixed(2) + 'Â°.' : '.');
  }

  function saveCalibration(){
    const rawEpsilonX = Number(lateralToleranceInput?.value);
    const rawEpsilonD = Number(stoppingDistanceToleranceInput?.value);
    if(!Number.isFinite(rawEpsilonX) || rawEpsilonX < 0 || !Number.isFinite(rawEpsilonD) || rawEpsilonD < 0){
      if(calibrationStatus) calibrationStatus.textContent = 'Invalid guidance tolerances. Enter finite values of 0 or greater.';
      if(calibration) loadCalibration();
      return;
    }
    const next = settings();
    if(next.baseline <= 0 || next.fovA <= 0 || next.fovA >= 180 || next.fovB <= 0 || next.fovB >= 180 || !Number.isFinite(next.epsilonX) || next.epsilonX < 0 || !Number.isFinite(next.epsilonD) || next.epsilonD < 0){
      if(calibrationStatus) calibrationStatus.textContent = 'Invalid calibration values.';
      return;
    }
    calibration = {...next, savedAt:new Date().toISOString()};
    localStorage.setItem('aerescueCalibration', JSON.stringify(calibration));
    if(calibrationStatus) calibrationStatus.textContent = 'Calibration saved. This geometry will be used automatically.';
    updateTargetDistanceDisplay();
    log('Camera calibration saved for the next trial.', 'hit');
  }

  window.addEventListener('storage', event => {
    if(event.key !== 'aerescueCalibration' || !event.newValue) return;
    try {
      const next = JSON.parse(event.newValue);
      if(![next.baseline, next.fovA, next.fovB].every(Number.isFinite) ||
         next.baseline <= 0 || next.fovA <= 0 || next.fovA >= 180 || next.fovB <= 0 || next.fovB >= 180) return;
      calibration = next;
      loadCalibration();
      alignedFrames = 0;
      lastObservationPair = null;
      if(state === 'ALIGNED') setStatus('GUIDING');
      updateTargetDistanceDisplay();
      log('Wall calibration applied: both camera HFOVs updated.', 'hit');
    } catch { /* Ignore malformed calibration from another tab. */ }
  });

  function cameraAngle(pixel, width, fov){
    const focal = (width / 2) / Math.tan(fov * Math.PI / 360);
    return Math.atan((pixel - width / 2) / focal);
  }

  function triangulate(pixelA, pixelB, widthA, widthB){
    const config = settings();
    if(![pixelA, pixelB, widthA, widthB, config.baseline, config.fovA, config.fovB].every(Number.isFinite) ||
       widthA <= 0 || widthB <= 0 || config.baseline <= 0 ||
       config.fovA <= 0 || config.fovA >= 180 || config.fovB <= 0 || config.fovB >= 180 ||
       pixelA < 0 || pixelA > widthA || pixelB < 0 || pixelB > widthB) return null;
    const phiA = Number.isFinite(config.phiA) ? config.phiA : 0;
    const phiB = Number.isFinite(config.phiB) ? config.phiB : 0;
    const boresightA = cameraAngle(pixelA, widthA, config.fovA) + phiA * Math.PI / 180;
    const boresightB = cameraAngle(pixelB, widthB, config.fovB) + phiB * Math.PI / 180;
    const tangentDifference = Math.tan(boresightA) - Math.tan(boresightB);
    if(!Number.isFinite(tangentDifference) || tangentDifference <= 1e-9) return null;
    const depth = config.baseline / tangentDifference;
    const lateral = -config.baseline / 2 + depth * Math.tan(boresightA);
    if(!Number.isFinite(lateral) || !Number.isFinite(depth) || depth <= 0) return null;
    return { x: lateral, z: depth };
  }

  function updateTargetDistanceDisplay(){
    updateTriangleDiagram();

    if(!targetDistanceEstimate){
      return;
    }

    if(!targetA || !targetB){
      targetDistanceEstimate.textContent = 'Target position: —';
      return;
    }

    // Target marks are normalized image coordinates; their geometry does not
    // depend on receiving a tracked-object measurement or frame dimensions.
    const widthA = 1;
    const widthB = 1;

    const config = settings();
    const pixelA = targetA.x * widthA;
    const pixelB = targetB.x * widthB;
    const position = triangulate(pixelA, pixelB, widthA, widthB);

    if(!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)){
      targetDistanceEstimate.textContent =
        'Target distance: unstable estimate; reselect the same target area in both cameras';
      return;
    }

    const midpointDistance = Math.hypot(position.x, position.z);
    const targetHeading =
      90 - Math.atan2(position.x, position.z) * 180 / Math.PI;
    targetDistanceEstimate.textContent =
      'Target distance: ~' + midpointDistance.toFixed(2) + ' m from camera midpoint · ' +
      'Target heading: ' + targetHeading.toFixed(1) + '°';
  }

  // ---- Triangulation triangle diagram ----------------------------------

  function describeArc(vx, vy, r, x1, y1, x2, y2){
    // Arc along the interior angle at vertex (vx,vy), between the
    // directions toward (x1,y1) and (x2,y2), sweeping the short way.
    const a1 = Math.atan2(y1 - vy, x1 - vx);
    const a2 = Math.atan2(y2 - vy, x2 - vx);
    let diff = a2 - a1;
    while(diff > Math.PI) diff -= 2 * Math.PI;
    while(diff <= -Math.PI) diff += 2 * Math.PI;
    const sx1 = vx + r * Math.cos(a1);
    const sy1 = vy + r * Math.sin(a1);
    const sx2 = vx + r * Math.cos(a2);
    const sy2 = vy + r * Math.sin(a2);
    const sweep = diff > 0 ? 1 : 0;
    const bisector = a1 + diff / 2;
    return {
      d: 'M ' + sx1.toFixed(2) + ' ' + sy1.toFixed(2) +
        ' A ' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + sx2.toFixed(2) + ' ' + sy2.toFixed(2),
      labelX: vx + (r + 20) * Math.cos(bisector),
      labelY: vy + (r + 20) * Math.sin(bisector)
    };
  }

  function svgEl(tag, attrs){
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for(const key in attrs){
      el.setAttribute(key, attrs[key]);
    }
    return el;
  }

  function resetDiagramReadout(){
    if(typeof midpointDisplacement !== 'undefined' && midpointDisplacement) midpointDisplacement.textContent = 'Unavailable';
    if(typeof perpendicularDistance !== 'undefined' && perpendicularDistance) perpendicularDistance.textContent = 'Unavailable';
    [dgObjectDistance, dgObjectLateral, dgObjectForward]
      .forEach(el => { if(el) el.textContent = 'Unavailable'; });
    [dgBaseline, dgSideA, dgSideB, dgRange, dgAngleA, dgAngleB, dgAngleT, dgHeading, dgPerpA, dgPerpB, dgLineDepth]
      .forEach(el => { if(el) el.textContent = '—'; });
  }

  function drawEmptyTriangleDiagram(message){
    if(!triangleSvg) return;
    triangleSvg.innerHTML = '';
    resetDiagramReadout();
    if(diagramStatus) diagramStatus.textContent = message;

    const config = settings();
    const marginX = 90;
    const baseY = 300;
    const halfSpan = 200;
    const camAx = 320 - halfSpan;
    const camBx = 320 + halfSpan;

    triangleSvg.appendChild(svgEl('line', {
      x1: camAx, y1: baseY, x2: camBx, y2: baseY,
      stroke: 'var(--line-hair-strong)', 'stroke-width': 1.5, 'stroke-dasharray': '5 5'
    }));

    [[camAx, 'CAM A'], [camBx, 'CAM B']].forEach(([cx, label]) => {
      triangleSvg.appendChild(svgEl('circle', {cx, cy: baseY, r: 7, fill: 'var(--guide-cyan)'}));
      const t = svgEl('text', {x: cx, y: baseY + 26, 'text-anchor': 'middle', class: 'dg-label'});
      t.textContent = label;
      triangleSvg.appendChild(t);
    });

    const baseLabel = svgEl('text', {x: 320, y: baseY + 46, 'text-anchor': 'middle', class: 'dg-dim'});
    baseLabel.textContent = 'baseline ' + config.baseline.toFixed(2) + ' m';
    triangleSvg.appendChild(baseLabel);

    const hint = svgEl('text', {x: 320, y: 60, 'text-anchor': 'middle', class: 'dg-dim'});
    hint.textContent = message;
    triangleSvg.appendChild(hint);
  }

  function updateTriangleDiagram(){
    if(!triangleSvg) return;

    if(!targetA || !targetB){
      drawEmptyTriangleDiagram('Mark the target in both camera feeds to render the triangle.');
      return;
    }

    const widthA = 1;
    const widthB = 1;

    const config = settings();
    const pixelA = targetA.x * widthA;
    const pixelB = targetB.x * widthB;

    const position = triangulate(pixelA, pixelB, widthA, widthB);
    if(!position){
      drawEmptyTriangleDiagram('Unstable geometry â€” reselect the same target area in both cameras.');
      return;
    }
    const lateral = position.x;
    const depth = position.z;
    const sideA = Math.hypot(lateral + config.baseline / 2, depth);
    const sideB = Math.hypot(lateral - config.baseline / 2, depth);
    const triangleAngleA = Math.atan2(depth, lateral + config.baseline / 2);
    const triangleAngleB = Math.atan2(depth, config.baseline / 2 - lateral);
    const triangleAngleTarget = Math.PI - triangleAngleA - triangleAngleB;

    if(!Number.isFinite(triangleAngleTarget) || triangleAngleTarget < 0.01){
      drawEmptyTriangleDiagram('Unstable geometry — reselect the same target area in both cameras.');
      return;
    }

    if(![sideA, sideB, lateral, depth].every(Number.isFinite) || depth <= 0){
      drawEmptyTriangleDiagram('Unstable geometry — reselect the same target area in both cameras.');
      return;
    }

    const midpointDistance = Math.hypot(lateral, depth);
    if(typeof midpointDisplacement !== 'undefined' && midpointDisplacement) midpointDisplacement.textContent = midpointDistance.toFixed(2) + ' m';
    if(typeof perpendicularDistance !== 'undefined' && perpendicularDistance) perpendicularDistance.textContent = depth.toFixed(2) + ' m';
    const targetHeading = 90 - Math.atan2(lateral, depth) * 180 / Math.PI;
    const object = relativeObjectPosition({x: lateral, z: depth});
    if(dgObjectDistance) dgObjectDistance.textContent = object ? object.distance.toFixed(2) + ' m' : 'Unavailable';
    if(dgObjectLateral) dgObjectLateral.textContent = object ? Math.abs(object.lateral).toFixed(2) + ' m ' + (object.lateral < 0 ? 'left' : object.lateral > 0 ? 'right' : '') : 'Unavailable';
    if(dgObjectForward) dgObjectForward.textContent = object ? Math.abs(object.forward).toFixed(2) + ' m ' + (object.forward < 0 ? 'before target' : object.forward > 0 ? 'past target' : '') : 'Unavailable';

    // ---- readout ----
    if(diagramStatus) diagramStatus.textContent = 'Live triangulation from the current target marks.';
    if(dgBaseline) dgBaseline.textContent = config.baseline.toFixed(2) + ' m';
    if(dgSideA) dgSideA.textContent = sideA.toFixed(2) + ' m';
    if(dgSideB) dgSideB.textContent = sideB.toFixed(2) + ' m';
    if(dgRange) dgRange.textContent = midpointDistance.toFixed(2) + ' m';
    if(dgAngleA) dgAngleA.textContent = (triangleAngleA * 180 / Math.PI).toFixed(1) + '°';
    if(dgAngleB) dgAngleB.textContent = (triangleAngleB * 180 / Math.PI).toFixed(1) + '°';
    if(dgAngleT) dgAngleT.textContent = (triangleAngleTarget * 180 / Math.PI).toFixed(1) + '°';
    if(dgHeading) dgHeading.textContent = targetHeading.toFixed(1) + '°';

    // Straight-ahead (90°-heading) perpendicular distance from each camera
    // to the horizontal "range line" running through the target — as
    // opposed to sideA/sideB, which are the diagonal line-of-sight
    // distances. Both cameras sit on the same baseline, so this is the
    // same forward distance ("depth") for each of them.
    const perpA = Math.abs(depth - 0);
    const perpB = Math.abs(depth - 0);
    if(dgPerpA) dgPerpA.textContent = perpA.toFixed(2) + ' m';
    if(dgPerpB) dgPerpB.textContent = perpB.toFixed(2) + ' m';
    if(dgLineDepth) dgLineDepth.textContent = depth.toFixed(2) + ' m';

    // ---- geometry -> svg coordinates ----
    // World space: baseline along x (CamA negative, CamB positive), target
    // offset forward (world "depth") from the baseline.
    const worldAx = -config.baseline / 2, worldAy = 0;
    const worldBx = config.baseline / 2, worldBy = 0;
    const worldTx = lateral, worldTy = depth;

    const minX = Math.min(worldAx, worldBx, worldTx, object?.position.x ?? worldTx);
    const maxX = Math.max(worldAx, worldBx, worldTx, object?.position.x ?? worldTx);
    const minY = 0;
    const maxY = Math.max(depth, object?.position.z ?? depth, config.baseline * 0.25);

    const spanX = Math.max(maxX - minX, 0.001);
    const spanY = Math.max(maxY - minY, 0.001);

    const plotLeft = 70, plotRight = 570, plotBottom = 300, plotTop = 60;
    const plotW = plotRight - plotLeft, plotH = plotBottom - plotTop;

    const padX = spanX * 0.18, padY = spanY * 0.15;
    const scale = Math.min(plotW / (spanX + padX * 2), plotH / (spanY + padY * 2));

    const originWorldX = (minX + maxX) / 2;
    function toSvgX(wx){ return plotLeft + plotW / 2 + (wx - originWorldX) * scale; }
    function toSvgY(wy){ return plotBottom - (wy - minY) * scale; }

    const ax = toSvgX(worldAx), ay = toSvgY(worldAy);
    const bx = toSvgX(worldBx), by = toSvgY(worldBy);
    const tx = toSvgX(worldTx), ty = toSvgY(worldTy);
    const midX = toSvgX(0);

    triangleSvg.innerHTML = '';

    // ---- range line (horizontal, through the target) + 90°-heading ref ----
    const lineLeft = Math.max(20, Math.min(plotLeft, ax - 30, bx - 30));
    const lineRight = Math.min(620, Math.max(plotRight, ax + 30, bx + 30));
    triangleSvg.appendChild(svgEl('line', {
      x1: lineLeft, y1: ty, x2: lineRight, y2: ty,
      stroke: 'var(--align-green)', 'stroke-width': 1.5, 'stroke-dasharray': '3 4'
    }));
    const rangeLabel = svgEl('text', {x: lineRight - 4, y: ty - 8, 'text-anchor': 'end', class: 'dg-range-label'});
    rangeLabel.textContent = 'range line · ' + depth.toFixed(2) + ' m ahead';
    triangleSvg.appendChild(rangeLabel);

    // 90°-heading reference: straight up from the baseline midpoint
    triangleSvg.appendChild(svgEl('line', {
      x1: midX, y1: plotBottom, x2: midX, y2: ty,
      stroke: 'var(--text-muted)', 'stroke-width': 1.2, 'stroke-dasharray': '2 4'
    }));
    const headingLabel = svgEl('text', {x: midX, y: ty - 22, 'text-anchor': 'middle', class: 'dg-dim'});
    headingLabel.textContent = '90° heading';
    triangleSvg.appendChild(headingLabel);

    // per-camera perpendicular ("directly in front") connectors to the range line
    [[ax, ay, 'Cam A'], [bx, by, 'Cam B']].forEach(([cx, cyBase, label]) => {
      triangleSvg.appendChild(svgEl('line', {
        x1: cx, y1: cyBase, x2: cx, y2: ty,
        stroke: 'var(--signal-orange)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3'
      }));
      const t = svgEl('text', {x: cx, y: (cyBase + ty) / 2, 'text-anchor': cx < midX ? 'end' : 'start', dx: cx < midX ? -6 : 6, class: 'dg-perp-label'});
      t.textContent = depth.toFixed(2) + ' m';
      triangleSvg.appendChild(t);
    });

    // triangle fill
    triangleSvg.appendChild(svgEl('polygon', {
      points: ax + ',' + ay + ' ' + bx + ',' + by + ' ' + tx + ',' + ty,
      fill: 'var(--guide-cyan-dim)', stroke: 'none'
    }));

    // sides
    const sideStyle = {stroke: 'var(--guide-cyan)', 'stroke-width': 2};
    triangleSvg.appendChild(svgEl('line', {x1: ax, y1: ay, x2: bx, y2: by, ...sideStyle, 'stroke-dasharray': '5 5'}));
    triangleSvg.appendChild(svgEl('line', {x1: ax, y1: ay, x2: tx, y2: ty, ...sideStyle}));
    triangleSvg.appendChild(svgEl('line', {x1: bx, y1: by, x2: tx, y2: ty, ...sideStyle}));

    // angle arcs
    const arcA = describeArc(ax, ay, 26, bx, by, tx, ty);
    const arcB = describeArc(bx, by, 26, ax, ay, tx, ty);
    const arcT = describeArc(tx, ty, 22, ax, ay, bx, by);
    [arcA, arcB, arcT].forEach(arc => {
      triangleSvg.appendChild(svgEl('path', {d: arc.d, fill: 'none', stroke: 'var(--signal-orange)', 'stroke-width': 1.5}));
    });

    const angleLabel = (arc, text) => {
      const t = svgEl('text', {x: arc.labelX, y: arc.labelY, 'text-anchor': 'middle', class: 'dg-angle'});
      t.textContent = text;
      triangleSvg.appendChild(t);
    };
    angleLabel(arcA, (triangleAngleA * 180 / Math.PI).toFixed(1) + '°');
    angleLabel(arcB, (triangleAngleB * 180 / Math.PI).toFixed(1) + '°');
    angleLabel(arcT, (triangleAngleTarget * 180 / Math.PI).toFixed(1) + '°');

    // side length labels (midpoints, offset)
    const midLabel = (x1, y1, x2, y2, text, dx, dy) => {
      const t = svgEl('text', {x: (x1 + x2) / 2 + dx, y: (y1 + y2) / 2 + dy, 'text-anchor': 'middle', class: 'dg-dim'});
      t.textContent = text;
      triangleSvg.appendChild(t);
    };
    midLabel(ax, ay, bx, by, config.baseline.toFixed(2) + ' m', 0, 20);
    midLabel(ax, ay, tx, ty, sideA.toFixed(2) + ' m', -34, -6);
    midLabel(bx, by, tx, ty, sideB.toFixed(2) + ' m', 34, -6);

    // vertex points + labels
    triangleSvg.appendChild(svgEl('circle', {cx: ax, cy: ay, r: 7, fill: 'var(--guide-cyan)'}));
    triangleSvg.appendChild(svgEl('circle', {cx: bx, cy: by, r: 7, fill: 'var(--guide-cyan)'}));
    triangleSvg.appendChild(svgEl('circle', {cx: tx, cy: ty, r: 7, fill: 'var(--signal-orange)'}));

    const vertexLabel = (x, y, text, dy) => {
      const t = svgEl('text', {x, y: y + dy, 'text-anchor': 'middle', class: 'dg-label'});
      t.textContent = text;
      triangleSvg.appendChild(t);
    };
    vertexLabel(ax, ay, 'CAM A', 26);
    vertexLabel(bx, by, 'CAM B', 26);
    vertexLabel(tx, ty, 'TARGET', ty < ay - 16 ? -16 : -20);
    if(object){
      const ox = toSvgX(object.position.x), oy = toSvgY(object.position.z);
      triangleSvg.appendChild(svgEl('line', {
        x1: ox, y1: oy, x2: tx, y2: ty,
        stroke: 'var(--align-green)', 'stroke-width': 2.5, 'stroke-dasharray': '6 4'
      }));
      triangleSvg.appendChild(svgEl('circle', {
        cx: ox, cy: oy, r: 6, fill: 'var(--align-green)',
        stroke: 'var(--bg-panel)', 'stroke-width': 2
      }));
      vertexLabel(ox, oy, 'OBJECT', 22);
      const label = svgEl('text', {
        x: (ox + tx) / 2 + 10, y: (oy + ty) / 2 - 8,
        'text-anchor': 'start', class: 'dg-object-distance'
      });
      label.textContent = object.distance.toFixed(2) + ' m to target';
      triangleSvg.appendChild(label);
    }
  }

  function updateAnalysis(){
    const successful = trialRecords.filter(record => record.success).length;
    const distances = trialRecords
      .map(record => record.closestDistance)
      .filter(Number.isFinite);
    if(trialCountEl) trialCountEl.textContent = String(trialRecords.length);
    if(successRateEl) successRateEl.textContent = trialRecords.length
      ? (100 * successful / trialRecords.length).toFixed(1) + '%'
      : '—';
    if(meanClosestEl) meanClosestEl.textContent = distances.length
      ? (distances.reduce((sum, value) => sum + value, 0) / distances.length).toFixed(2) + ' m'
      : '—';
  }

  function recordTrial(success){
    trialRecords.push({
      timestamp: new Date().toISOString(),
      trialId: trialIdInput?.value || '',
      cameraDistance: settings().baseline,
      fovA: settings().fovA,
      fovB: settings().fovB,
      targetDistance: Number(targetDistanceInput?.value) || (trialSamples.length ? trialSamples[trialSamples.length - 1].targetZ : null),
      closestDistance: Number.isFinite(closestDistance) ? closestDistance : null,
      sampleCount: trialSamples.length,
      overshoot: overshootDetected,
      success
    });
    updateAnalysis();
  }


  function log(msg, cls){

    if(!logEl){
      console.log(msg);
      return;
    }

    const div =
      document.createElement('div');

    div.className =
      'log-entry' +
      (cls ? ' ' + cls : '');

    const time =
      new Date().toLocaleTimeString(
        'en-GB',
        {
          hour12:false
        }
      );

    div.innerHTML =
      '<span class="t">' +
      time +
      '</span>' +
      msg;

    logEl.prepend(div);
  }


  function setStatus(s){

    state = s;

    if(statusPill){

      statusPill.className =
        'status-pill ' +
        s.toLowerCase();
    }

    if(statusLabel){
      statusLabel.textContent = s;
    }
  }


  async function callApi(path, opts){

    try{

      const res =
        await fetch(path, {signal:AbortSignal.timeout(15000), ...opts});

      const data =
        await res.json().catch(() => ({}));

      return {
        ok: res.ok,
        data
      };

    }catch(err){

      return {
        ok:false,
        data:{
          error:
            'Backend not reachable (start server.py).'
        }
      };
    }
  }


  function populateSelect(
    select,
    camList,
    placeholder
  ){

    if(!select){
      return;
    }

    const previous =
      select.value;

    select.innerHTML = '';


    if(camList.length === 0){

      const opt =
        document.createElement('option');

      opt.value = '';
      opt.textContent = placeholder;

      select.appendChild(opt);

      select.disabled = true;

      return;
    }


    select.disabled = false;


    camList.forEach(cam => {

      const opt =
        document.createElement('option');

      opt.value =
        String(cam.index);

      opt.textContent =
        cam.label;

      select.appendChild(opt);

    });


    const stillPresent =
      camList.some(
        cam =>
          String(cam.index) === previous
      );


    if(stillPresent){

      select.value =
        previous;
    }
  }


  async function scanCameras(){

    if(selectA){
      selectA.disabled = true;
    }

    if(selectB){
      selectB.disabled = true;
    }


    log(
      'Scanning for connected cameras…'
    );


    const {
      ok,
      data
    } =
      await callApi('/api/cameras');


    if(!ok){

      log(
        'Camera scan failed: ' +
        (
          data?.error ||
          'backend not reachable.'
        ),
        'warn'
      );


      populateSelect(
        selectA,
        [],
        'No backend — start server.py'
      );


      populateSelect(
        selectB,
        [],
        'No backend — start server.py'
      );

      return;
    }


    const camList =
      data.cameras || [];


    lastCamList =
      camList;


    if(camList.length === 0){

      log(
        'No cameras detected. Check connections and click "Rescan cameras".',
        'warn'
      );

    }else{

      log(
        'Detected ' +
        camList.length +
        ' camera(s): ' +
        camList
          .map(c => c.label)
          .join(', ') +
        '.'
      );
    }


    populateSelect(
      selectA,
      camList,
      'No cameras detected'
    );


    populateSelect(
      selectB,
      camList,
      'No cameras detected'
    );

    if(selectA && selectB && selectA.value === selectB.value && camList.length > 1){
      selectB.value = String(camList.find(cam => String(cam.index) !== selectA.value).index);
    }


    updateLaunchButton();
    startCameraPreview();
  }


  function markTarget(which, event){
    if(
      state === 'GUIDING' ||
      state === 'ALIGNED'
    ){
      return;
    }


    const wrap = which === 'A' ? wrapA : wrapB;
    const bounds = wrap?.getBoundingClientRect();
    const x = bounds
      ? Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100))
      : 50;

    showReferenceLine(which, x);

    if(which === 'A'){
      targetA = {x:x / 100, y:0.5};
      if(hintA) hintA.textContent = 'Target marked in Cam A';
      log('Target selected in Cam A.');
    }else{
      targetB = {x:x / 100, y:0.5};
      if(hintB) hintB.textContent = 'Target marked in Cam B';
      log('Target selected in Cam B.');
    }


    checkTargets();
  }


  function checkTargets(){

    updateLaunchButton();


    if(
      targetA !== null &&
      targetB !== null
    ){

      updateTargetDistanceDisplay();

      if(state === 'STANDBY'){
        setStatus('ARMED');
      }


      log(
        'Target confirmed in both feeds. Ready to launch.',
        'hit'
      );

    }else{

      if(
        state !== 'GUIDING' &&
        state !== 'ALIGNED'
      ){

        setStatus('STANDBY');
      }
    }
  }


  function updateLaunchButton(){

    if(!btnLaunch){
      return;
    }


    const cameraReady =
      selectA &&
      selectA.value !== '' &&
      selectB &&
      selectB.value !== '';


    const targetsReady =
      targetA !== null &&
      targetB !== null;


    btnLaunch.disabled =
      !cameraReady ||
      !targetsReady ||
      state === 'GUIDING' ||
      state === 'ALIGNED';
  }


  async function startCameraPreview(){

    if(!selectA || !selectB || selectA.value === '' || selectB.value === ''){
      return;
    }

    const cameraA = parseInt(selectA.value, 10);
    const cameraB = parseInt(selectB.value, 10);

    if(Number.isNaN(cameraA) || Number.isNaN(cameraB)){
      return;
    }

    const status = await callApi('/api/status');
    if(status.ok && status.data.running){
      await callApi('/api/stop', {method:'POST'});
    }

    const { ok, data } = await callApi(
      '/api/launch',
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({camera_a:cameraA, camera_b:cameraB})
      }
    );

    if(!ok && data?.error !== 'Tracker is already running.'){
      log(
        'Camera preview failed: ' +
        (data?.error || 'unknown error'),
        'warn'
      );
      return;
    }

    showLiveStream();
    pollStatus();
    pollTrack();
  }


  if(streamA){

    streamA.addEventListener(
      'click',
      event => markTarget('A', event)
    );
  }


  if(streamB){

    streamB.addEventListener(
      'click',
      event => markTarget('B', event)
    );
  }


  let realTrack = { A:null, B:null };
  let latestGuidance = null;
  const collectionChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('aerescue-live') : null;

  function publishCollectionSnapshot(){
    const config = settings();
    const trackSnapshot = track => {
      const valid = Boolean(track?.fresh && track.locked && Number.isFinite(track.cx) && Number.isFinite(track.cy));
      return {
        valid,
        state: track?.state || 'UNAVAILABLE',
        center: valid ? {x:track.cx, y:track.cy} : null,
        frameWidth: Number.isFinite(track?.frame_w) ? track.frame_w : null,
        frameHeight: Number.isFinite(track?.frame_h) ? track.frame_h : null,
        capturedAt: Number.isFinite(track?.captured_at) ? track.captured_at : null
      };
    };
    const tracking = {A:trackSnapshot(realTrack.A), B:trackSnapshot(realTrack.B)};
    tracking.bothValid = tracking.A.valid && tracking.B.valid && Number.isFinite(tracking.A.capturedAt) && Number.isFinite(tracking.B.capturedAt) && Math.abs(tracking.A.capturedAt - tracking.B.capturedAt) <= 0.25;
    const target = targetA && targetB ? triangulate(targetA.x, targetB.x, 1, 1) : null;
    const object = tracking.A.valid && tracking.B.valid &&
      Number.isFinite(tracking.A.capturedAt) && Number.isFinite(tracking.B.capturedAt) &&
      Math.abs(tracking.A.capturedAt - tracking.B.capturedAt) <= 0.25 &&
      triangulate(realTrack.A.cx, realTrack.B.cx, realTrack.A.frame_w, realTrack.B.frame_w);
    const targetData = target ? {
      x:target.x,
      z:target.z,
      midpointDistance:Math.hypot(target.x, target.z),
      perpendicularDistance:target.z,
      imageA:targetA.x,
      imageB:targetB.x
    } : null;
    const objectData = object ? {x:object.x, z:object.z} : null;
    const snapshot = {
      timestamp:new Date().toISOString(),
      available:true,
      calibration:{baseline:config.baseline, fovA:config.fovA, fovB:config.fovB, phiA:config.phiA, phiB:config.phiB, version:calibration?.savedAt || null},
      tracking,
      target:targetData,
      object:objectData,
      relativeDistance:targetData && objectData ? Math.hypot(objectData.x - targetData.x, objectData.z - targetData.z) : null,
      guidance:latestGuidance
    };
    try { localStorage.setItem('aerescueLiveSnapshot', JSON.stringify(snapshot)); } catch {}
    collectionChannel?.postMessage(snapshot);
  }


  let trackPoll = null;
  let trackPollBusy = false;


  function pollTrack(){

    if(trackPoll){
      return;
    }


    trackPoll =
      setInterval(
        async () => {

          if(trackPollBusy) return;
          trackPollBusy = true;
          const [trackA, trackB] = await Promise.all([
            callApi('/api/track?camera=A'),
            callApi('/api/track?camera=B')
          ]);
          trackPollBusy = false;

          if(!trackA.ok || !trackB.ok){
            realTrack = {A:trackA.ok ? {...trackA.data, receivedAt:performance.now()} : null,
                         B:trackB.ok ? {...trackB.data, receivedAt:performance.now()} : null};
            unavailableTelemetry();
            if(typeof publishCollectionSnapshot === 'function') publishCollectionSnapshot();
            return;
          }

          const wasLocked = realTrack.A?.fresh && realTrack.A?.locked && realTrack.B?.fresh && realTrack.B?.locked;
          const wasLinked = Boolean(realTrack.A?.linked || realTrack.B?.linked);
          realTrack = {A:{...trackA.data, receivedAt:performance.now()}, B:{...trackB.data, receivedAt:performance.now()}};
          if(wrapA && trackA.data.frame_w > 0 && trackA.data.frame_h > 0) wrapA.style.aspectRatio = trackA.data.frame_w + '/' + trackA.data.frame_h;
          if(wrapB && trackB.data.frame_w > 0 && trackB.data.frame_h > 0) wrapB.style.aspectRatio = trackB.data.frame_w + '/' + trackB.data.frame_h;
          updateTargetDistanceDisplay();
          if(typeof publishCollectionSnapshot === 'function') publishCollectionSnapshot();
          const isLocked = realTrack.A.fresh && realTrack.A.locked && realTrack.B.fresh && realTrack.B.locked;
          // 'linked' comes from the server correlating each camera's own
          // fresh entry-side lock timestamp - it's what confirms the two
          // cameras are actually seeing the same object cross the gap
          // (possibly seconds apart), not just two unrelated orange blobs
          // that happen to both be locked right now.
          const isLinked = Boolean(realTrack.A.linked || realTrack.B.linked);
          if(isLinked && !wasLinked){

            log(
              'Cross-camera match confirmed — same object tracked entering from the gap on both cameras.',
              'hit'
            );

          }else if(isLocked && !wasLocked){

            log(
              'Live detection acquired — tracker has a real lock on the orange folder.',
              'hit'
            );

          }else if(wasLocked && !isLocked){

            log(
              'Live detection lost — the orange folder is no longer in view.',
              'warn'
            );
          }

        },
        200
      );
  }


  function stopTrackPoll(){

    if(trackPoll){

      clearInterval(trackPoll);
      trackPoll = null;
    }


    realTrack = {A:null, B:null};
    latestGuidance = null;
    if(typeof publishCollectionSnapshot === 'function') publishCollectionSnapshot();
  }


  let statusPoll = null;


  function pollStatus(){

    if(statusPoll){
      return;
    }


    statusPoll =
      setInterval(
        async () => {

          const {
            ok,
            data
          } =
            await callApi('/api/status');


          if(!ok){
            return;
          }


          if(
            !data.running &&
            (
              state === 'GUIDING' ||
              state === 'ALIGNED'
            )
          ){

            clearInterval(statusPoll);
            statusPoll = null;


            stopTrackPoll();
            hideLiveStream();
            if(state === 'GUIDING'){
              recordTrial(false);
            }


            setStatus('STANDBY');


            updateLaunchButton();


            if(hintA){

              hintA.textContent =
                'Click the feed to mark the target';
            }


            if(hintB){

              hintB.textContent =
                'Click the feed to mark the target';
            }


            log(
              'Tracker process ended (exit code ' +
              data.exit_code +
              ').',
              'warn'
            );
          }

        },
        1000
      );
  }


  function telemetryLoop(){

    updateTriangulatedTelemetry();
    // Refresh even during failed polling so stale distances disappear.
    if(!telemetryLoop.lastDiagramUpdate || performance.now() - telemetryLoop.lastDiagramUpdate >= 200){
      updateTriangleDiagram();
      telemetryLoop.lastDiagramUpdate = performance.now();
    }

    requestAnimationFrame(
      telemetryLoop
    );
  }

  function unavailableTelemetry(){
    if(typeof latestGuidance !== 'undefined') latestGuidance = null;
    alignedFrames = 0;
    lastFrame = null;
    lastObservationPair = null;
    if(state === 'ALIGNED') setStatus('GUIDING');
    [vA, vB, vE, vErr, vBand].forEach(element => { if(element) element.textContent = 'Unavailable'; });
    if(vU) vU.textContent = 'STOP — LOCALIZATION UNAVAILABLE';
    if(tolFill) tolFill.style.width = '0%';
  }

  function updateTriangulatedTelemetry(){
    if(state !== 'GUIDING' && state !== 'ALIGNED') return;
    if(!targetA || !targetB || !realTrack.A || !realTrack.B){
      unavailableTelemetry();
      return;
    }
    const trackA = realTrack.A;
    const trackB = realTrack.B;
    const usable = track => track.fresh && track.locked && Number.isFinite(track.cx) &&
      performance.now() - track.receivedAt < 1000;
    if(hintA) hintA.textContent = 'Camera A: ' + (usable(trackA) ? trackA.state : 'LOST');
    if(hintB) hintB.textContent = 'Camera B: ' + (usable(trackB) ? trackB.state : 'LOST');
    if(!usable(trackA) || !usable(trackB) || Math.abs(trackA.captured_at - trackB.captured_at) > 0.25){
      unavailableTelemetry();
      return;
    }
    if(lastObservationPair && (trackA.captured_at <= lastObservationPair[0] || trackB.captured_at <= lastObservationPair[1])) return;

    const target = triangulate(
      targetA.x * trackA.frame_w,
      targetB.x * trackB.frame_w,
      trackA.frame_w,
      trackB.frame_w
    );
    const objectPosition = triangulate(
      trackA.cx,
      trackB.cx,
      trackA.frame_w,
      trackB.frame_w
    );
    if(!target || !objectPosition || !Number.isFinite(target.x) || !Number.isFinite(objectPosition.x)){
      unavailableTelemetry();
      return;
    }
    lastObservationPair = [trackA.captured_at, trackB.captured_at];

    const horizontalError = objectPosition.x - target.x;
    const distance = Math.hypot(horizontalError, objectPosition.z - target.z);
    closestDistance = Math.min(closestDistance, distance);
    // Per-camera pixel diagnostics only; guidance uses metric measurements below.
    const a = targetB.x * trackB.frame_w - trackB.cx;
    const b = trackA.cx - targetA.x * trackA.frame_w;
    const E = Math.abs(a) + Math.abs(b);
    const e = objectPosition.x - target.x;
    const now = Math.max(trackA.captured_at, trackB.captured_at) * 1000;
    const dt = lastFrame === null ? 0.2 : Math.max(0.001, (now - lastFrame) / 1000);
    lastFrame = now;
    elapsed += dt;
    const config = settings();
    const epsilonX = Number.isFinite(config.epsilonX) && config.epsilonX >= 0 ? config.epsilonX : 3;
    const epsilonD = Number.isFinite(config.epsilonD) && config.epsilonD >= 0 ? config.epsilonD : 3;

    if(recording){
      trialSamples.push({
        timestamp: new Date().toISOString(),
        trialId: trialIdInput?.value || '',
        targetX: target.x,
        targetZ: target.z,
        objectX: objectPosition.x,
        objectZ: objectPosition.z,
        horizontalError,
        a,
        b,
        combinedError: E,
        directionalError: e,
        stoppingDistanceTolerance: epsilonD
      });
    }

    if(vA) vA.textContent = a.toFixed(1) + ' px';
    if(vB) vB.textContent = b.toFixed(1) + ' px';
    if(vE) vE.textContent = E.toFixed(1) + ' px';
    if(vErr) vErr.textContent = e.toFixed(2) + ' m';
    if(vBand) vBand.textContent = '±' + epsilonX.toFixed(2) + ' m';
    const guidance = distance <= epsilonD ? 'STOP/HOLD' : Math.abs(e) > epsilonX ? (e < 0 ? 'RIGHT' : 'LEFT') : 'FORWARD';
    if(typeof latestGuidance !== 'undefined') latestGuidance = {
      command:guidance,
      directionalError:e,
      target:{x:target.x, z:target.z},
      object:{x:objectPosition.x, z:objectPosition.z},
      relativeDistance:distance
    };
    if(typeof publishCollectionSnapshot === 'function') publishCollectionSnapshot();
    if(vU) vU.textContent = guidance + ' | D_DT ' + distance.toFixed(2) + ' m | Δx ' + e.toFixed(2) + ' m';
    if(vTime) vTime.textContent = elapsed.toFixed(2) + ' s';

    const aligned = guidance === 'STOP/HOLD';
    alignedFrames = aligned ? alignedFrames + 1 : 0;
    if(tolFill) tolFill.style.width = Math.min(100, 100 * alignedFrames / settings().requiredFrames).toFixed(0) + '%';
    if(state === 'ALIGNED' && !aligned) setStatus('GUIDING');
    if(alignedFrames >= settings().requiredFrames && state !== 'ALIGNED'){
      setStatus('ALIGNED');
      if(recording) recordTrial(true);
      if(hintA) hintA.textContent = 'Target reached';
      if(hintB) hintB.textContent = 'Target reached';
      log('Dual-camera alignment confirmed after ' + alignedFrames + ' consecutive frames.', 'hit');
    }
  }


  requestAnimationFrame(
    telemetryLoop
  );


  if(btnLaunch){

    btnLaunch.addEventListener(
      'click',
      async () => {

        if(
          targetA === null ||
          targetB === null
        ){

          log(
            'Launch blocked: mark a target in both camera feeds first.',
            'warn'
          );

          return;
        }


        if(!selectA){

          log(
            'Launch failed: Cam A selector was not found in the HTML.',
            'warn'
          );

          return;
        }


        btnLaunch.disabled = true;


        const cameraIndex =
          parseInt(
            selectA.value,
            10
          );
        const cameraBIndex =
          parseInt(
            selectB.value,
            10
          );


        if(Number.isNaN(cameraIndex) || Number.isNaN(cameraBIndex)){

          log(
            'Launch failed: select cameras for both feeds. Rescan cameras first.',
            'warn'
          );

          updateLaunchButton();
          return;
        }


        const cameraLabel =
          selectA.selectedOptions[0]?.textContent ||
          'selected camera';


        log(
          'Requesting tracker launch from base station backend…'
        );


        const {
          ok,
          data
        } =
          await callApi(
            '/api/launch',
            {
              method:'POST',
              headers:{
                'Content-Type':
                  'application/json'
              },
              body:JSON.stringify({
                camera_a: cameraIndex,
                camera_b: cameraBIndex
              })
            }
          );


        const trackerAlreadyRunning =
          data?.error === 'Tracker is already running.';


        if(!ok && !trackerAlreadyRunning){

          log(
            'Launch failed: ' +
            (
              data?.error ||
              'unknown error'
            ),
            'warn'
          );

          updateLaunchButton();
          return;
        }


        // Arm tracking now: each process snapshots whatever's already
        // in its view as background to ignore, then starts watching
        // for something NEW entering frame. Tracking search begins
        // right here (in response to this click), not the instant
        // the camera process opened.
        const arm = await callApi(
          '/api/track-start',
          {method:'POST'}
        );

        if(!arm.ok){
          log(
            'Launch failed: could not arm tracking. ' +
            (arm.data?.error || 'unknown error'),
            'warn'
          );
          updateLaunchButton();
          return;
        }


        log(
          'Tracker processes started (pids ' +
          (data.pids ? Object.values(data.pids).join(', ') : 'already running') +
          ') on ' +
          cameraLabel +
          '. Loading live video…',
          'hit'
        );


        log(
          'Armed — ignoring whatever\'s already in view, watching for the target to walk in.'
        );


        setStatus('GUIDING');


        if(hintA){

          hintA.textContent =
            'Computational guidance active';
        }


        if(hintB){

          hintB.textContent =
            'Computational guidance active';
        }


        t = 0;
        elapsed = 0;
        lastFrame = null;
        alignedFrames = 0;
        overshootDetected = false;
        closestDistance = Infinity;
        trialSamples.length = 0;


        pollStatus();
        pollTrack();


        showLiveStream();
      }
    );
  }


  if(btnReset){

    btnReset.addEventListener(
      'click',
      async () => {

        if(statusPoll){

          clearInterval(statusPoll);
          statusPoll = null;
        }


        stopTrackPoll();
        hideLiveStream();


        const {
          ok
        } =
          await callApi(
            '/api/stop',
            {
              method:'POST'
            }
          );


        if(ok){

          log(
            'Tracker process stopped.',
            'warn'
          );
        }


        targetA = null;
        targetB = null;
        hideReferenceLines();
        updateTargetDistanceDisplay();


        t = 0;
        elapsed = 0;
        lastFrame = null;
        alignedFrames = 0;
        overshootDetected = false;
        closestDistance = Infinity;
        trialSamples.length = 0;


        setStatus('STANDBY');


        updateLaunchButton();


        if(hintA){

          hintA.textContent =
            'Click the feed to mark the target';
        }


        if(hintB){

          hintB.textContent =
            'Click the feed to mark the target';
        }


        if(vA) vA.textContent = '—';
        if(vB) vB.textContent = '—';
        if(vE) vE.textContent = '—';
        if(vErr) vErr.textContent = '—';


        if(vU){

          vU.textContent =
            'Guidance unavailable';
        }


        if(vTime){

          vTime.textContent =
            '0.00 s';
        }


        if(tolFill){

          tolFill.style.width =
            '0%';
        }


        log(
          'System reset. Awaiting target selection.'
        );
      }
    );
  }


  if(btnRescan){

    btnRescan.addEventListener(
      'click',
      scanCameras
    );
  }

  if(btnExport){
    btnExport.addEventListener('click', () => {
      const header = ['recordType','trialId','timestamp','cameraDistance','fovA','fovB','targetDistance','closestDistance','sampleCount','targetX','targetZ','objectX','objectZ','horizontalError','a','b','combinedError','directionalError','stoppingDistanceTolerance','overshoot','success'];
      const rows = [
        ...trialRecords.map(record => ['trial', record.trialId, record.timestamp, record.cameraDistance, record.fovA, record.fovB, record.targetDistance, record.closestDistance, record.sampleCount, '', '', '', '', '', '', '', '', '', '', record.overshoot, record.success]),
        ...trialSamples.map(sample => ['sample', sample.trialId, sample.timestamp, '', '', '', '', '', '', sample.targetX, sample.targetZ, sample.objectX, sample.objectZ, sample.horizontalError, sample.a, sample.b, sample.combinedError, sample.directionalError, sample.stoppingDistanceTolerance, '', ''])
      ].map(row => row.map(value => JSON.stringify(value ?? '')).join(','));
      const blob = new Blob([[header.join(','), ...rows].join('\n')], {type:'text/csv'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'aerescue-trials.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  if(btnCalibrate){
    btnCalibrate.addEventListener('click', saveCalibration);
  }

  [cameraDistanceInput, fovAInput, fovBInput].forEach(input => {
    if(input) input.addEventListener('input', updateTargetDistanceDisplay);
  });

  if(btnRecord){
    btnRecord.addEventListener('click', () => {
      recording = !recording;
      if(recording){
        trialSamples.length = 0;
        closestDistance = Infinity;
      }
      btnRecord.textContent = recording ? 'Stop recording' : 'Start recording';
      if(recordingStatus) recordingStatus.textContent = recording ? 'Recording telemetry for this trial.' : 'Recording stopped.';
      log(recording ? 'Telemetry recording started.' : 'Telemetry recording stopped.', recording ? 'hit' : 'warn');
    });
  }


  if(selectA){

    selectA.addEventListener(
      'change',
      () => {

        log(
          'Cam A input switched to ' +
          (
            selectA.selectedOptions[0]?.textContent ||
            '—'
          ) +
          '.'
        );


        updateLaunchButton();
        startCameraPreview();
      }
    );
  }


  if(selectB){

    selectB.addEventListener(
      'change',
      () => {

        log(
          'Cam B input switched to ' +
          (
            selectB.selectedOptions[0]?.textContent ||
            '—'
          ) +
          '.'
        );

        updateLaunchButton();
        startCameraPreview();
      }
    );
  }


  log(
    'AERESCUE base station online. Awaiting operator input.'
  );

  loadCalibration();
  updateTargetDistanceDisplay();


  scanCameras();

})();
