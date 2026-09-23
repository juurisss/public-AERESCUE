"""Browser camera uploads. Each slot has one sender and no queued frames."""
import secrets
import threading
import time

import cv2
import numpy as np
from flask import Blueprint, jsonify, request, abort

from orange_object_tracker.models import Observation
from orange_object_tracker.orange import OrangeFolderTracker, drawObservation

remote = Blueprint('remote', __name__)
lock = threading.RLock()
slots = {}
active = {}  # console channel -> remote slot
armed = False
MAX_FRAME_BYTES = 64 * 1024 * 1024


def reset_active(mapping=None):
    global armed
    with lock:
        armed = False
        active.clear()
        active.update(mapping or {})
        for slot in slots.values():
            slot['armed'] = False
            slot['tracker'].reset()
            slot['measurement'] = {}


def arm():
    global armed
    with lock:
        armed = True
        for name in active.values():
            if name in slots:
                slots[name]['tracker'].reset()
                slots[name]['armed'] = True
                slots[name]['measurement'] = {}


def measurement(channel):
    with lock:
        slot = slots.get(active.get(channel), {})
        return dict(slot.get('measurement', {}))


def jpeg(channel):
    with lock:
        slot = slots.get(active.get(channel), {})
        return slot.get('jpeg') if time.time() - slot.get('seen', 0) < 1 else None


def authenticated(name):
    slot = slots.get(name)
    if not slot or not secrets.compare_digest(slot['token'], request.headers.get('X-Camera-Token', '')):
        abort(403)
    return slot


@remote.post('/api/remote/<name>/connect')
def connect(name):
    if name not in ('1', '2'):
        abort(404)
    with lock:
        if name in slots and time.time() - slots[name]['seen'] < 5:
            return jsonify(error='This camera slot is already sharing. Choose the other slot.'), 409
        token = secrets.token_urlsafe(32)
        slots[name] = dict(token=token, seen=time.time(), tracker=OrangeFolderTracker(),
                           armed=armed and name in active.values(), measurement={}, jpeg=None, ticket=None)
    return jsonify(token=token)


@remote.post('/api/remote/<name>/ticket')
def ticket(name):
    with lock:
        slot = authenticated(name)
        slot['seen'] = time.time()
        slot['ticket'] = (secrets.token_urlsafe(16), time.time())
        return jsonify(ticket=slot['ticket'][0])


@remote.post('/api/remote/<name>/frame')
def upload(name):
    # Timestamp the capture request on the server, avoiding laptop clock skew.
    # A delayed upload is discarded instead of becoming a fresh measurement.
    if request.mimetype != 'image/jpeg':
        abort(415)
    if request.content_length is None or request.content_length > MAX_FRAME_BYTES:
        abort(413)
    data = request.get_data()
    with lock:
        slot = authenticated(name)
        ticket = slot['ticket']
        slot['ticket'] = None
        if not ticket or ticket[0] != request.headers.get('X-Frame-Ticket') or time.time() - ticket[1] > 0.25:
            return jsonify(error='Frame expired; sending the next frame.', code='FRAME_EXPIRED'), 409
        frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) if data else None
        if frame is None:
            return jsonify(error='Invalid JPEG frame.'), 400
        result = slot['tracker'].update(frame) if slot['armed'] else Observation(state='STANDBY')
        h, w = frame.shape[:2]
        slot['measurement'] = dict(locked=result.valid, cx=result.center[0] if result.center else None,
            cy=result.center[1] if result.center else None, frame_w=w, frame_h=h,
            captured_at=ticket[1], updated_at=time.time(), state=result.state,
            bbox=result.bbox, confidence=result.confidence)
        drawObservation(frame, result)
        ok, encoded = cv2.imencode('.jpg', frame)
        slot['jpeg'] = encoded.tobytes() if ok else None
        slot['seen'] = time.time()
    return jsonify(ok=True)


@remote.post('/api/remote/<name>/disconnect')
def disconnect(name):
    with lock:
        authenticated(name)
        del slots[name]
    return jsonify(ok=True)
