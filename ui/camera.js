(() => {
  const byId = id => document.getElementById(id);
  const video = byId('previewVideo'), status = byId('shareStatus');
  const preview = byId('preview'), share = byId('share'), stop = byId('stop');
  const device = byId('device'), slot = byId('slot');
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  let stream = null, session = null, generation = 0;

  async function api(path, options = {}) {
    const response = await fetch(path, {signal: AbortSignal.timeout(3000), ...options});
    const data = await response.json().catch(() => ({}));
    if(!response.ok) {
      const error = new Error(data.error || 'Connection failed (' + response.status + ').');
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function releaseSession(current) {
    if(current) fetch(current.url + '/disconnect', {
      method:'POST', headers:{'X-Camera-Token':current.token}, keepalive:true
    }).catch(() => {});
  }

  function stopCamera(message = 'Camera stopped. No video is being sent.') {
    generation++;
    const old = session;
    session = null;
    if(stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    releaseSession(old);
    preview.disabled = false;
    share.disabled = true;
    stop.disabled = true;
    slot.disabled = device.disabled = false;
    status.textContent = message;
  }

  async function openCamera() {
    stopCamera();
    const attempt = generation;
    preview.disabled = true;
    try {
      if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera permission requires trusted HTTPS. Open https://SERVER-IP:5443/camera after HTTPS setup; HTTP only works on localhost.');
      }
      const opened = await navigator.mediaDevices.getUserMedia({audio:false, video:{
        frameRate:{ideal:10}, resizeMode:{ideal:'none'},
        ...(device.value ? {deviceId:{exact:device.value}} : {})
      }});
      if(attempt !== generation) { opened.getTracks().forEach(track => track.stop()); return; }
      stream = opened;
      // Prefer the source's largest advertised mode; never resize its frames
      // in our sender. Older browsers retain their selected capture mode.
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() || {};
      if(track.applyConstraints && capabilities.width?.max && capabilities.height?.max){
        try {
          await track.applyConstraints({
            width:{ideal:capabilities.width.max}, height:{ideal:capabilities.height.max},
            resizeMode:{ideal:'none'}, frameRate:{ideal:10}
          });
        } catch { /* Keep the working camera mode if the driver rejects it. */ }
      }
      if(attempt !== generation) return;
      video.srcObject = stream;
      await video.play();
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      if(attempt !== generation) return;
      device.replaceChildren(...cameras.map((camera, i) => new Option(camera.label || 'Camera ' + (i + 1), camera.deviceId)));
      device.value = stream.getVideoTracks()[0].getSettings().deviceId || '';
      stream.getVideoTracks()[0].addEventListener('ended', () => stopCamera('Camera disconnected. Allow camera access again to reconnect.'));
      stream.getVideoTracks()[0].addEventListener('mute', () => stopCamera('Camera feed paused by the device. Allow camera access again to reconnect.'));
      stop.disabled = share.disabled = false;
      status.textContent = 'Preview ready at ' + video.videoWidth + ' × ' + video.videoHeight + '. Video stays on this laptop until you click Start sharing.';
    } catch(error) {
      if(attempt === generation) stopCamera(error.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in your browser, then try again.' : error.message);
    } finally {
      if(attempt === generation) preview.disabled = false;
    }
  }

  async function sendFrames(current) {
    let count = 0;
    let lastVideoTime = -1, lastNewFrame = performance.now();
    while(session === current) {
      try {
        if(video.paused || video.readyState < 2) throw new Error('Camera preview paused.');
        if(video.currentTime === lastVideoTime){
          if(performance.now() - lastNewFrame > 1000) throw new Error('Camera stopped producing frames.');
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }
        lastVideoTime = video.currentTime;
        lastNewFrame = performance.now();
        const headers = {'X-Camera-Token': current.token};
        const ticket = await api(current.url + '/ticket', {method:'POST', headers});
        if(session !== current) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if(session !== current) return;
        if(!blob) throw new Error('Could not capture a camera frame.');
        await api(current.url + '/frame', {method:'POST', headers:{...headers,
          'Content-Type':'image/jpeg', 'X-Frame-Ticket':ticket.ticket}, body:blob});
        if(session !== current) return;
        status.textContent = 'Sharing as Browser camera ' + current.slot + ' · ' + canvas.width + ' × ' + canvas.height + ' · ' + (++count) + ' frames sent. Keep this page open.';
      } catch(error) {
        if(session !== current) return;
        if(error.code === 'FRAME_EXPIRED' ||
           (error.status === 409 && error.message.startsWith('Frame expired'))){
          status.textContent = 'Sharing continues. Delayed frame skipped; sending the next frame.';
        } else {
          stopCamera('Sharing stopped: ' + error.message + ' Allow camera / preview to reconnect.');
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  preview.addEventListener('click', openCamera);
  device.addEventListener('change', openCamera);
  stop.addEventListener('click', () => stopCamera());
  share.addEventListener('click', async () => {
    if(!stream || session) return;
    const attempt = generation, selected = slot.value;
    share.disabled = preview.disabled = slot.disabled = device.disabled = true;
    try {
      const url = '/api/remote/' + selected;
      const result = await api(url + '/connect', {method:'POST'});
      const current = {url, token:result.token, slot:selected};
      if(attempt !== generation) { releaseSession(current); return; }
      session = current;
      sendFrames(current);
    } catch(error) {
      if(attempt === generation) {
        status.textContent = error.message;
        share.disabled = preview.disabled = slot.disabled = device.disabled = false;
      }
    }
  });
  window.addEventListener('pagehide', () => stopCamera());
})();
