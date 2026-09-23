(() => {
  const $ = id => document.getElementById(id);
  const M = window.AERESCUEDataMetrics;
  const FAILURE_STATES = ['Valid', 'Tracking Failure', 'Calibration Failure', 'Ambiguous Detection', 'Operator Error', 'Other'];
  const GUIDANCE_STATES = ['LEFT', 'RIGHT', 'FORWARD', 'STOP/HOLD'];
  let sessionData = null;
  let liveSnapshot = null;
  let liveReceivedAt = 0;
  let capturedTarget = null;
  let capturedRelative = null;
  let capturedGuidance = null;
  let trackingRun = null;
  let trackingTimer = null;
  const liveChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('aerescue-live') : null;

  const nowIso = () => new Date().toISOString();
  const number = id => {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : null;
  };
  const text = id => String($(id)?.value || '').trim();
  const fmt = (value, digits=3) => Number.isFinite(value) ? Number(value).toFixed(digits) : 'N/A';
  const pct = value => Number.isFinite(value) ? value.toFixed(2) + '%' : 'N/A';
  const esc = value => String(value ?? 'N/A').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const validRecord = record => record.validity === 'Valid' && record.excluded !== true;

  async function api(url, options={}){
    const response = await fetch(url, {headers:{'Content-Type':'application/json'}, ...options});
    const data = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function setStatus(id, message, kind=''){
    const element = $(id);
    if(!element) return;
    element.textContent = message;
    element.className = 'form-status ' + kind;
  }

  function snapshotFromStorage(){
    try {
      const parsed = JSON.parse(localStorage.getItem('aerescueLiveSnapshot') || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  }

  function acceptLiveSnapshot(snapshot){
    if(!snapshot || typeof snapshot !== 'object') return;
    liveSnapshot = snapshot;
    liveReceivedAt = Date.now();
    $('liveConnection').textContent = 'Console connected';
    $('liveConnection').classList.add('connected');
    updateLiveFields();
  }

  liveChannel?.addEventListener('message', event => acceptLiveSnapshot(event.data));
  window.addEventListener('storage', event => {
    if(event.key === 'aerescueLiveSnapshot') acceptLiveSnapshot(snapshotFromStorage());
  });

  function currentSnapshot(){
    if(liveSnapshot && Date.now() - liveReceivedAt < 2500) return liveSnapshot;
    const stored = snapshotFromStorage();
    if(stored){ acceptLiveSnapshot(stored); return stored; }
    return null;
  }

  function calibrationFromSnapshot(snapshot=currentSnapshot()){
    return snapshot?.calibration || {
      baseline:number('sessionBaseline'),
      fovA:null, fovB:null, phiA:null, phiB:null
    };
  }

  function updateLiveFields(){
    const snapshot = currentSnapshot();
    const target = snapshot?.target;
    const object = snapshot?.object;
    const relative = snapshot?.relativeDistance;
    $('targetEstimatedMidpoint').textContent = target ? fmt(target.midpointDistance) + ' m' : 'N/A';
    $('targetEstimatedPerpendicular').textContent = target ? fmt(target.perpendicularDistance) + ' m' : 'N/A';
    $('targetEstimatedPosition').textContent = target ? '(' + fmt(target.x) + ', ' + fmt(target.z) + ') m' : 'N/A';
    $('relativeEstimated').textContent = Number.isFinite(relative) ? fmt(relative) + ' m' : 'N/A';
    $('relativeTargetPosition').textContent = target ? '(' + fmt(target.x) + ', ' + fmt(target.z) + ') m' : 'N/A';
    $('relativeObjectPosition').textContent = object ? '(' + fmt(object.x) + ', ' + fmt(object.z) + ') m' : 'N/A';
    $('guidanceGenerated').textContent = snapshot?.guidance?.command || 'N/A';
    $('guidanceError').textContent = Number.isFinite(snapshot?.guidance?.directionalError) ? fmt(snapshot.guidance.directionalError) + ' m' : 'N/A';
    $('guidancePositions').textContent = target && object ? '(' + fmt(target.x) + ', ' + fmt(target.z) + ') / (' + fmt(object.x) + ', ' + fmt(object.z) + ')' : 'N/A';
    const a = snapshot?.tracking?.A;
    const b = snapshot?.tracking?.B;
    $('trackingLiveA').textContent = a ? (a.valid ? 'VALID' : a.state || 'INVALID') : 'N/A';
    $('trackingLiveB').textContent = b ? (b.valid ? 'VALID' : b.state || 'INVALID') : 'N/A';
    $('trackingLiveBoth').textContent = a && b ? (snapshot.tracking.bothValid ? 'VALID' : 'INVALID') : 'N/A';
  }

  function nextTrialId(prefix){
    const records = sessionData ? Object.values(sessionData).flatMap(value => Array.isArray(value) ? value : []) : [];
    const used = new Set(records.map(record => record.trialId).filter(Boolean));
    let number = 1;
    while(used.has(prefix + '-' + String(number).padStart(3, '0'))) number += 1;
    return prefix + '-' + String(number).padStart(3, '0');
  }

  function populateTrialDefaults(){
    if(sessionData){
      ['targetTrialId','trackingTrialId','relativeTrialId','guidanceTrialId'].forEach(id => {
        if(!$(id).value) $(id).value = nextTrialId(id.replace('TrialId','').toUpperCase());
      });
      ['targetTrialNumber','trackingTrialNumber','relativeTrialNumber','guidanceTrialNumber'].forEach(id => {
        if(!$(id).value) $(id).value = String(nextTrialNumber());
      });
    }
  }

  function nextTrialNumber(){
    const records = sessionData ? Object.values(sessionData).flatMap(value => Array.isArray(value) ? value : []) : [];
    return records.reduce((maximum, record) => Math.max(maximum, Number(record.trialNumber) || 0), 0) + 1;
  }

  async function loadSessionList(){
    const data = await api('/api/data/sessions');
    const select = $('sessionSelect');
    select.replaceChildren(new Option('Open previous session…', ''));
    data.sessions.forEach(session => select.appendChild(new Option(session.sessionId + ' · ' + (session.createdAt || ''), session.sessionId)));
  }

  async function loadSession(sessionId){
    if(trackingRun) throw new Error('Stop the active tracking trial before changing sessions.');
    const data = await api('/api/data/sessions/' + encodeURIComponent(sessionId));
    sessionData = data.session;
    $('sessionId').value = sessionData.metadata.sessionId;
    $('sessionBaseline').value = sessionData.metadata.baseline ?? '';
    $('sessionNotes').value = sessionData.metadata.notes || '';
    setStatus('sessionStatus', 'Session loaded. Raw and derived records are stored on the server.', 'success');
    populateTrialDefaults();
    renderAll();
  }

  $('createSession').addEventListener('click', async () => {
    if(trackingRun){ setStatus('sessionStatus','Stop the active tracking trial before creating a session.','error'); return; }
    const sessionId = text('sessionId');
    const baseline = number('sessionBaseline');
    if(!sessionId || !Number.isFinite(baseline) || baseline <= 0){ setStatus('sessionStatus', 'Enter a unique session ID and a baseline greater than zero.', 'error'); return; }
    const snapshot = currentSnapshot();
    try {
      const data = await api('/api/data/sessions', {method:'POST', body:JSON.stringify({
        sessionId, baseline, notes:text('sessionNotes'), createdBy:'AERESCUE data collection',
        calibration:calibrationFromSnapshot(snapshot), software:{userAgent:navigator.userAgent, page:'data-collection'}
      })});
      sessionData = data.session;
      await loadSessionList();
      $('sessionSelect').value = sessionId;
      setStatus('sessionStatus', 'Session created and ready for trials.', 'success');
      populateTrialDefaults();
      renderAll();
    } catch(error){ setStatus('sessionStatus', error.message, 'error'); }
  });
  $('sessionSelect').addEventListener('change', event => { if(event.target.value) loadSession(event.target.value).catch(error => setStatus('sessionStatus', error.message, 'error')); });
  $('refreshSession').addEventListener('click', async () => { try { await loadSessionList(); if(sessionData) await loadSession(sessionData.metadata.sessionId); } catch(error){ setStatus('sessionStatus', error.message, 'error'); } });

  async function saveRecord(category, record, statusId){
    if(!sessionData){ setStatus(statusId, 'Create or open a session first.', 'error'); return false; }
    if(category !== 'reacquisition-events' && (!record.trialId || !record.trialId.trim())){ setStatus(statusId, 'Enter a unique trial ID.', 'error'); return false; }
    try {
      const data = await api('/api/data/sessions/' + encodeURIComponent(sessionData.metadata.sessionId) + '/records/' + category, {method:'POST', body:JSON.stringify({record})});
      sessionData[category].push(data.record);
      populateTrialDefaults();
      renderAll();
      setStatus(statusId, 'Saved. Raw inputs and system outputs are preserved in the session.', 'success');
      return true;
    } catch(error){ setStatus(statusId, error.message, 'error'); return false; }
  }

  function requireGroundTruth(ids, statusId){
    if(ids.some(id => !Number.isFinite(number(id)) || number(id) < 0)){ setStatus(statusId, 'Required ground-truth measurements must be entered and cannot be negative.', 'error'); return false; }
    return true;
  }

  $('captureTarget').addEventListener('click', () => {
    const snapshot = currentSnapshot();
    capturedTarget = snapshot?.target ? JSON.parse(JSON.stringify(snapshot.target)) : null;
    updateLiveFields();
    setStatus('targetStatus', capturedTarget ? 'Target estimate captured from the live console.' : 'No current target estimate is available. Mark the target in both console feeds.', capturedTarget ? 'success' : 'error');
  });
  $('saveTarget').addEventListener('click', () => {
    if(!requireGroundTruth(['actualTargetMidpoint','actualTargetPerpendicular'],'targetStatus')) return;
    const validity = text('targetValidity');
    if(validity === 'Valid' && !capturedTarget){ setStatus('targetStatus','A valid trial requires a captured system estimate. Mark the target or select a failure state.','error'); return; }
    const actualX = number('actualTargetX'), actualZ = number('actualTargetZ');
    const snapshot = currentSnapshot();
    const estimatedX = capturedTarget?.x, estimatedZ = capturedTarget?.z;
    const record = {
      trialId:text('targetTrialId'), trialNumber:number('targetTrialNumber'), recordedAt:nowIso(), validity,
      notes:text('targetNotes'), excluded:$('targetExcluded').value === 'true', exclusionReason:text('targetExclusionReason'), calibration:calibrationFromSnapshot(snapshot),
      actualMidpointDistance:number('actualTargetMidpoint'), actualPerpendicularDistance:number('actualTargetPerpendicular'),
      actualPosition:Number.isFinite(actualX) && Number.isFinite(actualZ) ? {x:actualX,z:actualZ} : null,
      estimatedPosition:Number.isFinite(estimatedX) && Number.isFinite(estimatedZ) ? {x:estimatedX,z:estimatedZ} : null,
      estimatedMidpointDistance:capturedTarget?.midpointDistance ?? null,
      estimatedPerpendicularDistance:capturedTarget?.perpendicularDistance ?? null,
      midpointAbsoluteError:M.absoluteError(capturedTarget?.midpointDistance, number('actualTargetMidpoint')),
      perpendicularAbsoluteError:M.absoluteError(capturedTarget?.perpendicularDistance, number('actualTargetPerpendicular')),
      localization2DError:Number.isFinite(actualX) && Number.isFinite(actualZ) && Number.isFinite(estimatedX) && Number.isFinite(estimatedZ) ? Math.hypot(estimatedX-actualX, estimatedZ-actualZ) : null,
      systemOutputCapturedAt:capturedTarget ? (snapshot?.timestamp || nowIso()) : null,
      systemSnapshot:capturedTarget ? snapshot : null
    };
    saveRecord('target-localization', record, 'targetStatus');
  });

  function sampleTracking(){
    if(!trackingRun) return;
    const snapshot = currentSnapshot();
    const usableSnapshot = snapshot && Date.now() - liveReceivedAt < 2500;
    const a = usableSnapshot ? snapshot.tracking?.A : null;
    const b = usableSnapshot ? snapshot.tracking?.B : null;
    if(usableSnapshot) observeLossTransitions(snapshot, trackingRun);
    const observation = {
      timestamp:nowIso(), elapsedTime:(Date.now()-trackingRun.startedAt)/1000,
      dataAvailable:Boolean(usableSnapshot), cameraAValid:Boolean(a?.valid), cameraBValid:Boolean(b?.valid), bothValid:Boolean(snapshot?.tracking?.bothValid),
      cameraACenter:a?.center || null, cameraBCenter:b?.center || null,
      cameraAState:a?.state || 'UNAVAILABLE', cameraBState:b?.state || 'UNAVAILABLE',
      cameraACapturedAt:a?.capturedAt ?? null, cameraBCapturedAt:b?.capturedAt ?? null
    };
    trackingRun.observations.push(observation);
    $('trackingDuration').textContent = fmt(observation.elapsedTime) + ' s';
    $('trackingObservationCount').textContent = String(trackingRun.observations.length);
    updateLiveFields();
  }

  $('startTracking').addEventListener('click', () => {
    if(!sessionData){ setStatus('trackingStatus','Create or open a session first.','error'); return; }
    if(!currentSnapshot() || Date.now() - liveReceivedAt >= 2500){ setStatus('trackingStatus','Open the AERESCUE console and start tracking before starting this trial.','error'); return; }
    if(!text('trackingTrialId')){ setStatus('trackingStatus','Enter a unique trial ID.','error'); return; }
    const initialSnapshot = currentSnapshot();
    trackingRun = {trialId:text('trackingTrialId'), trialNumber:number('trackingTrialNumber'), validity:text('trackingValidity'), excluded:$('trackingExcluded').value === 'true', exclusionReason:text('trackingExclusionReason'), notes:text('trackingNotes'), startedAt:Date.now(), observations:[], reacquisitionEvents:[], lossState:{A:{previousValid:Boolean(initialSnapshot?.tracking?.A?.valid), open:null}, B:{previousValid:Boolean(initialSnapshot?.tracking?.B?.valid), open:null}}, calibration:calibrationFromSnapshot()};
    $('startTracking').disabled = true; $('stopTracking').disabled = false;
    trackingTimer = setInterval(sampleTracking, 250); sampleTracking();
    setStatus('trackingStatus','Tracking trial is sampling the live console every 250 ms.','success');
  });
  $('stopTracking').addEventListener('click', async () => {
    if(!trackingRun) return;
    clearInterval(trackingTimer); trackingTimer = null;
    const run = trackingRun; trackingRun = null;
    closeOpenLosses(run);
    const summary = M.trackingSummary(run.observations);
    const common = {trialId:run.trialId, trialNumber:run.trialNumber, recordedAt:nowIso(), validity:run.validity, excluded:run.excluded, exclusionReason:run.exclusionReason, notes:run.notes, calibration:run.calibration, startedAt:new Date(run.startedAt).toISOString(), endedAt:nowIso()};
    const summarySaved = await saveRecord('tracking-summary', {...common, ...summary, reacquisitionEventCount:run.reacquisitionEvents.length}, 'trackingStatus');
    if(summarySaved) await saveRecord('tracking-observations', {...common, observationSamplingMs:250, observations:run.observations}, 'trackingStatus');
    for(const event of run.reacquisitionEvents) await saveRecord('reacquisition-events', event, 'trackingStatus');
    $('startTracking').disabled = false; $('stopTracking').disabled = true;
  });

  function observeLossTransitions(snapshot, run){
    if(!run || !snapshot?.tracking) return;
    ['A','B'].forEach(camera => {
      const currentValid = Boolean(snapshot.tracking[camera]?.valid);
      const state = run.lossState[camera];
      if(state.previousValid === true && !currentValid && !state.open){
        state.open = {recordId:'loss-' + camera + '-' + Date.now(), sourceTrialId:run.trialId, camera, lostAt:snapshot.timestamp || nowIso(), reacquiredAt:null, reacquisitionTimeMs:null, reacquisitionOpportunity:true, successful:false, lossState:snapshot.tracking[camera]?.state || 'LOST'};
      }else if(state.previousValid === false && currentValid && state.open){
        state.open = {...state.open, reacquiredAt:snapshot.timestamp || nowIso(), reacquisitionTimeMs:Math.max(0, new Date(snapshot.timestamp || nowIso()) - new Date(state.open.lostAt)), successful:true, reacquiredState:snapshot.tracking[camera]?.state || 'TRACKING'};
        run.reacquisitionEvents.push(state.open); state.open = null;
      }
      state.previousValid = currentValid;
    });
    renderReacquisition();
  }

  function closeOpenLosses(run){
    if(!run) return;
    ['A','B'].forEach(camera => {
      const state = run.lossState[camera];
      if(!state.open) return;
      const closed = {...state.open, endedAt:nowIso(), successful:false, failureReason:'No reacquisition observed before tracking trial stop'};
      state.open = null;
      run.reacquisitionEvents.push(closed);
    });
  }

  $('captureRelative').addEventListener('click', () => {
    const snapshot = currentSnapshot();
    capturedRelative = snapshot && Number.isFinite(snapshot.relativeDistance) ? {distance:snapshot.relativeDistance, target:snapshot.target, object:snapshot.object, capturedAt:snapshot.timestamp} : null;
    updateLiveFields();
    setStatus('relativeStatus', capturedRelative ? 'Relative-distance estimate captured from the live console.' : 'A simultaneous target/object estimate is unavailable.', capturedRelative ? 'success' : 'error');
  });
  $('saveRelative').addEventListener('click', () => {
    if(!requireGroundTruth(['actualRelativeDistance'],'relativeStatus')) return;
    const validity=text('relativeValidity');
    if(validity === 'Valid' && !capturedRelative){ setStatus('relativeStatus','A valid trial requires a captured system estimate.','error'); return; }
    const record={trialId:text('relativeTrialId'),trialNumber:number('relativeTrialNumber'),recordedAt:nowIso(),validity,excluded:$('relativeExcluded').value === 'true',exclusionReason:text('relativeExclusionReason'),notes:text('relativeNotes'),calibration:calibrationFromSnapshot(),actualTargetToObjectDistance:number('actualRelativeDistance'),estimatedTargetToObjectDistance:capturedRelative?.distance ?? null,relativeDistanceAbsoluteError:M.absoluteError(capturedRelative?.distance,number('actualRelativeDistance')),targetPosition:capturedRelative?.target ?? null,objectPosition:capturedRelative?.object ?? null,systemOutputCapturedAt:capturedRelative?.capturedAt ?? null};
    saveRecord('relative-distance',record,'relativeStatus');
  });

  $('captureGuidance').addEventListener('click', () => {
    const snapshot=currentSnapshot();
    capturedGuidance=snapshot?.guidance ? JSON.parse(JSON.stringify(snapshot.guidance)) : null;
    updateLiveFields();
    setStatus('guidanceStatus',capturedGuidance?.command ? 'Guidance output captured.' : 'No current guidance output is available.','' + (capturedGuidance?.command ? 'success' : 'error'));
  });
  $('saveGuidance').addEventListener('click', () => {
    const expected=text('guidanceExpected'), validity=text('guidanceValidity');
    if(!GUIDANCE_STATES.includes(expected)){ setStatus('guidanceStatus','Choose the expected output from the known physical arrangement.','error'); return; }
    if(validity === 'Valid' && !capturedGuidance?.command){ setStatus('guidanceStatus','A valid trial requires a captured generated output.','error'); return; }
    const generated=capturedGuidance?.command || null;
    const record={trialId:text('guidanceTrialId'),trialNumber:number('guidanceTrialNumber'),recordedAt:nowIso(),validity,excluded:$('guidanceExcluded').value === 'true',exclusionReason:text('guidanceExclusionReason'),notes:text('guidanceNotes'),calibration:calibrationFromSnapshot(),expectedOutput:expected,generatedOutput:generated,correct:generated ? expected === generated : null,directionalError:capturedGuidance?.directionalError ?? null,targetPosition:capturedGuidance?.target ?? null,objectPosition:capturedGuidance?.object ?? null,relativeDistance:capturedGuidance?.relativeDistance ?? null,systemOutputCapturedAt:capturedGuidance ? (currentSnapshot()?.timestamp || nowIso()) : null};
    saveRecord('guidance',record,'guidanceStatus');
  });

  function statMarkup(items){ return items.map(item => '<div class="stat"><span>' + esc(item.label) + '</span><strong>' + esc(item.value) + '</strong></div>').join(''); }
  function summaryItems(summary){ return [{label:'n',value:summary.n},{label:'Mean absolute error',value:fmt(summary.mean) + ' m'},{label:'Std. deviation',value:fmt(summary.standardDeviation) + ' m'},{label:'RMSE',value:fmt(summary.rmse) + ' m'},{label:'Minimum',value:fmt(summary.min) + ' m'},{label:'Maximum',value:fmt(summary.max) + ' m'}]; }
  function renderTarget(){
    const records=sessionData?.['target-localization'] || [], valid=records.filter(validRecord);
    const midpoint=M.summarize(valid.map(record=>record.midpointAbsoluteError)), perpendicular=M.summarize(valid.map(record=>record.perpendicularAbsoluteError));
    $('targetStats').innerHTML=statMarkup([{label:'Midpoint MAE',value:fmt(midpoint.mean)+' m'},{label:'Perpendicular MAE',value:fmt(perpendicular.mean)+' m'},{label:'Valid / all',value:valid.length+' / '+records.length},{label:'Failed preserved',value:String(records.length-valid.length)}]);
    $('targetTable').innerHTML=records.map(record=>'<tr class="'+(validRecord(record)?'':'failed')+'"><td>'+esc(record.trialId)+'</td><td>'+fmt(record.actualMidpointDistance)+' m</td><td>'+fmt(record.estimatedMidpointDistance)+' m</td><td>'+fmt(record.midpointAbsoluteError)+' m</td><td>'+fmt(record.actualPerpendicularDistance)+' m</td><td>'+fmt(record.estimatedPerpendicularDistance)+' m</td><td>'+fmt(record.perpendicularAbsoluteError)+' m</td><td>'+esc(record.validity)+'</td></tr>').join('');
    const groups={}; valid.forEach(record=>{const key=fmt(record.actualPerpendicularDistance);(groups[key] ||= []).push(record);});
    $('targetGroups').innerHTML=Object.entries(groups).map(([distance,group])=>{const s=M.summarize(group.map(record=>record.midpointAbsoluteError)),p=M.summarize(group.map(record=>record.perpendicularAbsoluteError));return '<p class="panel-note">At actual perpendicular distance '+esc(distance)+' m: n='+s.n+' · midpoint MAE '+fmt(s.mean)+' m · perpendicular MAE '+fmt(p.mean)+' m</p>';}).join('');
  }
  function renderTracking(){
    const records=sessionData?.['tracking-summary'] || [], valid=records.filter(validRecord), totals=valid.reduce((sum,record)=>{sum.total+=record.totalObservations||0;sum.a+=record.cameraAValidObservations||0;sum.b+=record.cameraBValidObservations||0;sum.both+=record.bothValidObservations||0;return sum;},{total:0,a:0,b:0,both:0});
    $('trackingStats').innerHTML=statMarkup([{label:'Camera A success',value:pct(M.percent(totals.a,totals.total))},{label:'Camera B success',value:pct(M.percent(totals.b,totals.total))},{label:'Both valid',value:pct(M.percent(totals.both,totals.total))},{label:'Valid / all trials',value:valid.length+' / '+records.length}]);
    $('trackingTable').innerHTML=records.map(record=>'<tr class="'+(validRecord(record)?'':'failed')+'"><td>'+esc(record.trialId)+'</td><td>'+pct(record.cameraASuccessPercent)+'</td><td>'+pct(record.cameraBSuccessPercent)+'</td><td>'+pct(record.bothValidPercent)+'</td><td>'+esc(record.totalObservations)+'</td><td>'+fmt(record.durationSeconds)+' s</td><td>'+esc(record.validity)+'</td></tr>').join('');
  }
  function renderReacquisition(){
    const events=[...(sessionData?.['reacquisition-events'] || []), ...(trackingRun?.reacquisitionEvents || [])], opportunities=events.filter(event=>event.reacquisitionOpportunity), successful=opportunities.filter(event=>event.successful), times=successful.map(event=>event.reacquisitionTimeMs).filter(Number.isFinite);
    $('reacquisitionStats').innerHTML=statMarkup([{label:'Losses / opportunities',value:events.length+' / '+opportunities.length},{label:'Successful',value:String(successful.length)},{label:'Success rate',value:pct(M.percent(successful.length,opportunities.length))},{label:'Mean reacquisition time',value:times.length?fmt(times.reduce((a,b)=>a+b,0)/times.length)+' ms':'N/A'}]);
    $('reacquisitionTable').innerHTML=events.map(event=>'<tr class="'+(event.successful?'':'failed')+'"><td>'+esc(event.camera)+'</td><td>'+esc(event.lostAt)+'</td><td>'+esc(event.reacquiredAt || 'N/A')+'</td><td>'+fmt(event.reacquisitionTimeMs)+' ms</td><td>'+esc(event.reacquisitionOpportunity)+'</td><td>'+esc(event.successful)+'</td><td>'+esc(event.successful?'REACQUIRED':'PENDING / FAILED')+'</td></tr>').join('');
  }
  function renderRelative(){
    const records=sessionData?.['relative-distance'] || [], valid=records.filter(validRecord), summary=M.summarize(valid.map(record=>record.relativeDistanceAbsoluteError));
    $('relativeStats').innerHTML=statMarkup([{label:'n',value:summary.n},{label:'Mean absolute error',value:fmt(summary.mean)+' m'},{label:'Std. deviation',value:fmt(summary.standardDeviation)+' m'},{label:'RMSE',value:fmt(summary.rmse)+' m'},{label:'Minimum',value:fmt(summary.min)+' m'},{label:'Maximum',value:fmt(summary.max)+' m'}]);
    $('relativeTable').innerHTML=records.map(record=>'<tr class="'+(validRecord(record)?'':'failed')+'"><td>'+esc(record.trialId)+'</td><td>'+fmt(record.actualTargetToObjectDistance)+' m</td><td>'+fmt(record.estimatedTargetToObjectDistance)+' m</td><td>'+fmt(record.relativeDistanceAbsoluteError)+' m</td><td>'+esc(record.validity)+'</td></tr>').join('');
  }
  function renderGuidance(){
    const records=sessionData?.guidance || [], valid=records.filter(validRecord), correct=valid.filter(record=>record.correct===true).length, matrix=M.confusionMatrix(valid,GUIDANCE_STATES);
    $('guidanceStats').innerHTML=statMarkup([{label:'Correct / total',value:correct+' / '+valid.length},{label:'Accuracy',value:pct(M.percent(correct,valid.length))},{label:'Valid / all trials',value:valid.length+' / '+records.length},{label:'Incorrect',value:String(valid.length-correct)}]);
    $('guidanceTable').innerHTML=records.map(record=>'<tr class="'+(validRecord(record)?(record.correct?'':'failed'):'failed')+'"><td>'+esc(record.trialId)+'</td><td>'+esc(record.expectedOutput)+'</td><td>'+esc(record.generatedOutput)+'</td><td>'+esc(record.correct)+'</td><td>'+fmt(record.directionalError)+' m</td><td>'+esc(record.validity)+'</td></tr>').join('');
    $('confusionHead').innerHTML='<tr><th>Expected \\ Generated</th>'+GUIDANCE_STATES.map(label=>'<th>'+label+'</th>').join('')+'</tr>';
    $('confusionBody').innerHTML=GUIDANCE_STATES.map(expected=>'<tr><th>'+expected+'</th>'+GUIDANCE_STATES.map(generated=>'<td>'+matrix[expected][generated]+'</td>').join('')+'</tr>').join('');
  }
  function sessionSummaryText(){
    const target=(sessionData?.['target-localization']||[]).filter(validRecord), relative=(sessionData?.['relative-distance']||[]).filter(validRecord), guidance=(sessionData?.guidance||[]).filter(validRecord), tracking=(sessionData?.['tracking-summary']||[]).filter(validRecord), targetMid=M.summarize(target.map(r=>r.midpointAbsoluteError)),targetPerp=M.summarize(target.map(r=>r.perpendicularAbsoluteError)),rel=M.summarize(relative.map(r=>r.relativeDistanceAbsoluteError)),correct=guidance.filter(r=>r.correct).length;
    const track=tracking.reduce((s,r)=>{s.total+=r.totalObservations||0;s.a+=r.cameraAValidObservations||0;s.b+=r.cameraBValidObservations||0;s.both+=r.bothValidObservations||0;return s;},{total:0,a:0,b:0,both:0});
    const events=sessionData?.['reacquisition-events']||[], opportunities=events.filter(e=>e.reacquisitionOpportunity), success=opportunities.filter(e=>e.successful);
    return 'AERESCUE EXPERIMENTAL SESSION\nSession: '+(sessionData?.metadata.sessionId||'N/A')+'\nCreated: '+(sessionData?.metadata.createdAt||'N/A')+'\nBaseline: '+fmt(sessionData?.metadata.baseline)+' m\n\nTARGET LOCALIZATION\nMidpoint MAE: '+fmt(targetMid.mean)+' m (n='+targetMid.n+')\nPerpendicular MAE: '+fmt(targetPerp.mean)+' m (n='+targetPerp.n+')\n\nTRACKING\nCamera A success: '+pct(M.percent(track.a,track.total))+'\nCamera B success: '+pct(M.percent(track.b,track.total))+'\nBoth valid: '+pct(M.percent(track.both,track.total))+'\n\nREACQUISITION\nSuccess: '+success.length+' / '+opportunities.length+'\nSuccess rate: '+pct(M.percent(success.length,opportunities.length))+'\n\nRELATIVE DISTANCE\nMAE: '+fmt(rel.mean)+' m (n='+rel.n+')\n\nGUIDANCE\nCorrect: '+correct+' / '+guidance.length+'\nAccuracy: '+pct(M.percent(correct,guidance.length));
  }
  function renderSummary(){
    const text=sessionSummaryText(); $('humanSummary').textContent=text;
    const target=(sessionData?.['target-localization']||[]).filter(validRecord), relative=(sessionData?.['relative-distance']||[]).filter(validRecord), guidance=(sessionData?.guidance||[]).filter(validRecord), events=sessionData?.['reacquisition-events']||[], opportunities=events.filter(e=>e.reacquisitionOpportunity),success=opportunities.filter(e=>e.successful), tracking=(sessionData?.['tracking-summary']||[]).filter(validRecord), totals=tracking.reduce((s,r)=>{s.t+=r.totalObservations||0;s.a+=r.cameraAValidObservations||0;s.b+=r.cameraBValidObservations||0;s.both+=r.bothValidObservations||0;return s;},{t:0,a:0,b:0,both:0});
    $('summaryCards').innerHTML=statMarkup([{label:'Target midpoint MAE',value:fmt(M.summarize(target.map(r=>r.midpointAbsoluteError)).mean)+' m'},{label:'Target perpendicular MAE',value:fmt(M.summarize(target.map(r=>r.perpendicularAbsoluteError)).mean)+' m'},{label:'Both-camera tracking',value:pct(M.percent(totals.both,totals.t))},{label:'Reacquisition success',value:success.length+'/'+opportunities.length},{label:'Relative-distance MAE',value:fmt(M.summarize(relative.map(r=>r.relativeDistanceAbsoluteError)).mean)+' m'},{label:'Guidance accuracy',value:pct(M.percent(guidance.filter(r=>r.correct).length,guidance.length))}]);
  }
  function renderAll(){ renderTarget();renderTracking();renderReacquisition();renderRelative();renderGuidance();renderSummary();updateLiveFields(); }

  function csvValue(value){ return '"' + String(value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value).replace(/"/g,'""') + '"'; }
  function download(name, content, type){ const blob=new Blob([content],{type});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();URL.revokeObjectURL(link.href); }
  function recordsForExport(kind){
    if(kind === 'reacquisition-events') return sessionData?.['reacquisition-events'] || [];
    if(kind === 'tracking-summary') return sessionData?.['tracking-summary'] || [];
    return sessionData?.[kind] || [];
  }
  function csv(records){
    if(!records.length) return 'No records\n';
    const keys=[...new Set(records.flatMap(record=>Object.keys(record)))];
    return [keys.map(csvValue).join(','),...records.map(record=>keys.map(key=>csvValue(record[key])).join(','))].join('\n')+'\n';
  }
  document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => {
    if(!sessionData){ setStatus('exportStatus','Create or open a session first.','error');return; }
    const kind=button.dataset.export, sessionId=sessionData.metadata.sessionId, safe=sessionId.replace(/[^A-Za-z0-9_-]/g,'_');
    if(kind === 'json') download(safe+'.json',JSON.stringify(sessionData,null,2),'application/json');
    else if(kind === 'summary') download(safe+'-summary.txt',sessionSummaryText(),'text/plain');
    else download(safe+'-'+kind+'.csv',csv(recordsForExport(kind)),'text/csv');
    setStatus('exportStatus','Export prepared: '+kind+'.','success');
  }));

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab,.tab-panel').forEach(element => element.classList.remove('active'));
    tab.classList.add('active'); document.querySelector('[data-panel="'+tab.dataset.tab+'"]').classList.add('active');
  }));

  $('sessionBaseline').value = currentSnapshot()?.calibration?.baseline || '';
  const defaultSessionId='AERESCUE-'+new Date().toISOString().slice(0,10);
  $('sessionId').value=defaultSessionId+'-01';
  loadSessionList().catch(error => setStatus('sessionStatus',error.message,'error'));
  const initial=snapshotFromStorage(); if(initial) acceptLiveSnapshot(initial);
  renderAll();
})();
