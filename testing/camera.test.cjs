const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('ui/camera.js', 'utf8');

function browser({secure = true, denied = false, occupied = false, expiredFrames = 0, width=640, height=480, negotiate=false, rejectMode=false} = {}) {
  const elements = new Map();
  const calls = [];
  let stops = 0;
  let uploads = 0;
  const track = {stop: () => stops++, getSettings: () => ({deviceId:'webcam'}), addEventListener() {}};
  if(negotiate){
    track.getCapabilities=()=>({width:{max:width},height:{max:height}});
    track.applyConstraints=async constraints=>{calls.push(['constraints',constraints]);if(rejectMode) throw new Error('Unsupported mode');};
  }
  const stream = {getTracks: () => [track], getVideoTracks: () => [track]};
  const element = id => {
    if(!elements.has(id)) elements.set(id, {
      value: id === 'slot' ? '1' : '', disabled:false, events:{},
      addEventListener(event, callback) { this.events[event] = callback; },
      replaceChildren() {}, play:async () => {},
      videoWidth:width, videoHeight:height, readyState:4, currentTime:1, paused:false
    });
    return elements.get(id);
  };
  const canvas = {
      getContext:() => ({drawImage() {}}), toBlob:callback => callback('jpeg')
    };
  const context = vm.createContext({
    document:{getElementById:element, createElement:() => canvas},
    window:{isSecureContext:secure, addEventListener() {}},
    navigator:{mediaDevices:{
      getUserMedia:async options => {
        calls.push(['permission', options]);
        if(denied) throw Object.assign(new Error('denied'), {name:'NotAllowedError'});
        return stream;
      },
      enumerateDevices:async () => [{kind:'videoinput', deviceId:'webcam', label:'Webcam'}]
    }},
    fetch:async (url, options) => {
      calls.push([url, options]);
      if(url.endsWith('/frame')) {
        if(uploads++ < expiredFrames) return {ok:false, status:409,
          json:async () => ({error:'Frame expired; sending the next frame.', code:'FRAME_EXPIRED'})};
        return new Promise(() => {});
      }
      const conflict = occupied && url.endsWith('/connect');
      return {ok:!conflict, status:conflict ? 409 : 200,
        json:async () => conflict ? {error:'Slot already sharing'} : {token:'owner',ticket:'capture'}};
    },
    Option:function(label, value) { this.value = value; },
    AbortSignal:{timeout() {}}, performance:{now:() => 100},
    setTimeout:callback => setTimeout(() => { element('previewVideo').currentTime += 1; callback(); }, 1),
  });
  vm.runInContext(source, context);
  return {element, calls, canvas, get stops() { return stops; }};
}

(async () => {
  const insecure = browser({secure:false});
  await insecure.element('preview').events.click();
  assert.match(insecure.element('shareStatus').textContent, /trusted HTTPS/);
  assert.equal(insecure.calls.length, 0);

  const denied = browser({denied:true});
  await denied.element('preview').events.click();
  assert.match(denied.element('shareStatus').textContent, /permission denied/);
  assert.equal(denied.element('share').disabled, true);

  const sharing = browser();
  await sharing.element('preview').events.click();
  assert.equal(sharing.calls.length, 1, 'Preview must not upload frames');
  assert.equal(sharing.calls[0][1].audio, false);
  assert.equal(sharing.element('share').disabled, false);
  await sharing.element('share').events.click();
  await new Promise(resolve => setImmediate(resolve));
  const upload = sharing.calls.find(([url]) => url.endsWith('/frame'));
  assert.ok(upload);
  assert.equal(upload[1].headers['X-Camera-Token'], 'owner');
  assert.equal(upload[1].headers['X-Frame-Ticket'], 'capture');
  sharing.element('stop').events.click();
  assert.equal(sharing.stops, 1);
  assert.equal(sharing.element('previewVideo').srcObject, null);
  assert.ok(sharing.calls.some(([url]) => url.endsWith('/disconnect')));

  const occupied = browser({occupied:true});
  await occupied.element('preview').events.click();
  await occupied.element('share').events.click();
  assert.match(occupied.element('shareStatus').textContent, /already sharing/);
  assert.equal(occupied.element('slot').disabled, false);
  assert.ok(!occupied.calls.some(([url]) => url.endsWith('/frame')));
  occupied.element('stop').events.click();
  const delayed = browser({expiredFrames:2});
  await delayed.element('preview').events.click();
  await delayed.element('share').events.click();
  for(let attempt = 0; attempt < 100 && delayed.calls.filter(([url]) => url.endsWith('/frame')).length < 3; attempt++){
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(delayed.calls.filter(([url]) => url.endsWith('/frame')).length, 3);
  assert.equal(delayed.calls.filter(([url]) => url.endsWith('/ticket')).length, 3);
  assert.equal(delayed.stops, 0, 'Expired uploads must not stop the webcam');
  assert.ok(!delayed.calls.some(([url]) => url.endsWith('/disconnect')));
  assert.equal(delayed.element('stop').disabled, false);
  delayed.element('stop').events.click();
  for(const [width,height,rejectMode] of [[1920,1080,false],[3840,2160,false],[1080,1920,true]]){
    const native=browser({width,height,negotiate:true,rejectMode});
    await native.element('preview').events.click();
    assert.equal(native.calls.find(([name])=>name==='constraints')[1].width.ideal,width);
    assert.equal(native.calls[0][1].video.width,undefined,'Do not request a fixed low-resolution capture');
    await native.element('share').events.click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(native.canvas.width,width);
    assert.equal(native.canvas.height,height);
    native.element('stop').events.click();
  }
  console.log('Camera page checks passed: HTTPS, denied permission, preview privacy, sharing, stop, occupied slot.');
})().catch(error => { console.error(error); process.exitCode = 1; });
