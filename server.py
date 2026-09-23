from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

import cv2
from flask import Flask, Response, jsonify, request, send_from_directory
import remote_camera
from backend import data_store, tracking_state

ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"
DATA_COLLECTION_DIR = ROOT / "data-collection"
EXPERIMENT_DATA_DIR = ROOT / "data" / "sessions"
DATA_CATEGORIES = data_store.DATA_CATEGORIES
SESSION_ID_RE = data_store.SESSION_ID_RE
MAX_CAMERA_PROBE = 10
STREAM_PORTS = {"A": 5001, "B": 5002}
app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = remote_camera.MAX_FRAME_BYTES
app.register_blueprint(remote_camera.remote)

_data_lock = threading.RLock()


def _utc_now() -> str:
    return data_store.utcNow()


def _valid_session_id(session_id: str) -> bool:
    return data_store.validSessionId(session_id)


def _session_dir(session_id: str) -> Path:
    return data_store.sessionDir(EXPERIMENT_DATA_DIR, session_id)


def _read_json(path: Path, default):
    return data_store.readJson(path, default)


def _write_json(path: Path, value) -> None:
    data_store.writeJson(path, value)


def _session_payload(session_id: str) -> dict:
    return data_store.sessionPayload(EXPERIMENT_DATA_DIR, session_id)


def _trial_id_exists(directory: Path, trial_id: str, category: str) -> bool:
    return data_store.trialIdExists(directory, trial_id, category)









_lock = threading.Lock()
_processes: dict[str, subprocess.Popen] = {}

_track_lock = tracking_state.trackLock
_track_state = tracking_state.trackState
TRACK_STALE_SECONDS = tracking_state.TRACK_STALE_SECONDS


def _reset_track_state() -> None:
    tracking_state.resetTrackState()


def _probe_cameras(max_index: int = MAX_CAMERA_PROBE) -> list[dict]:
    """
    Try opening each camera index in turn and grab one frame to confirm
    it's real and currently connected. Returns a list of
    {index, label, width, height} for every device that responded.

    OpenCV doesn't expose hardware names cross-platform without extra
    OS-specific libraries, so the label is built from index + resolution
    (e.g. "Camera 0 - 1280x720") rather than a real device name.
    """
    found = []

    for index in range(max_index):
        # Match the Windows backend fallback used by the tracker. Some
        # laptop cameras open through DirectShow but not through CAP_ANY.
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY] if sys.platform == "win32" else [None]
        for backend in backends:
            cap = cv2.VideoCapture(index, backend) if backend is not None else cv2.VideoCapture(index)
            try:
                if not cap.isOpened():
                    continue
                frame = None
                for _ in range(3):
                    ok, candidate = cap.read()
                    if ok and candidate is not None:
                        frame = candidate
                        break
                    time.sleep(0.05)
                if frame is None:
                    continue
                height, width = frame.shape[:2]
                found.append({"index": index, "label": f"Camera {index} - {width}x{height}", "width": width, "height": height})
                break
            finally:
                cap.release()

    return found


def _build_command(camera_index: int, camera_name: str, mirror_camera: str | None = None) -> list[str]:
    # Cam A sits on the left shore, Cam B on the right shore, both
    # facing the gap between them. That gap falls on the RIGHT side of
    # Cam A's own frame (the gap is to A's right) and on the LEFT side
    # of Cam B's own frame (the gap is to B's left) - i.e. the two
    # inner edges nearest each other, not the two outer edges. Each
    # process only searches the side of ITS OWN frame facing the gap
    # for a newly-arrived object.
    entry_sides = {"A": "right", "B": "left"}
    command = [
        sys.executable,
        str(ROOT / "run_tracker.py"),
        "--camera",
        str(camera_index),
        "--track-camera",
        camera_name if mirror_camera is None else f"{camera_name},{mirror_camera}",
        "--stream-port",
        str(STREAM_PORTS[camera_name]),
        "--entry-side",
        entry_sides.get(camera_name, "none"),
    ]
    if mirror_camera is not None:
        command.extend(("--mirror-stream-port", str(STREAM_PORTS[mirror_camera])))
    return command


def _is_running() -> bool:
    return bool(remote_camera.active) or any(process.poll() is None for process in _processes.values())


@app.route('/camera')
def camera_page():
    return send_from_directory(UI_DIR, 'camera.html')


@app.route('/callibrate')
@app.route('/calibrate')
def calibration_page():
    return send_from_directory(UI_DIR, 'calibrate.html')


@app.route('/data-collection/')
@app.route('/data-collection')
def data_collection_page():
    return send_from_directory(DATA_COLLECTION_DIR, 'index.html')


@app.route('/data-collection/<path:filename>')
def data_collection_static(filename):
    return send_from_directory(DATA_COLLECTION_DIR, filename)


@app.route('/api/data/sessions', methods=['GET'])
def list_data_sessions():
    EXPERIMENT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    sessions = []
    with _data_lock:
        for directory in sorted(EXPERIMENT_DATA_DIR.iterdir(), key=lambda item: item.name):
            if not directory.is_dir() or not _valid_session_id(directory.name):
                continue
            metadata = _read_json(directory / 'metadata.json', {})
            if metadata:
                sessions.append(metadata)
    return jsonify(ok=True, sessions=sessions)


@app.route('/api/data/sessions', methods=['POST'])
def create_data_session():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get('sessionId')
    if not _valid_session_id(session_id):
        return jsonify(ok=False, error='Session ID must be 3-80 characters using letters, numbers, underscores or hyphens.'), 400
    directory = _session_dir(session_id)
    with _data_lock:
        if directory.exists():
            return jsonify(ok=False, error='That session ID already exists.'), 409
        metadata = dict(payload)
        metadata.update(sessionId=session_id, schemaVersion=1, createdAt=_utc_now(), updatedAt=_utc_now())
        directory.mkdir(parents=True, exist_ok=False)
        _write_json(directory / 'metadata.json', metadata)
        for category in DATA_CATEGORIES:
            _write_json(directory / f'{category}.json', [])
    return jsonify(ok=True, session=_session_payload(session_id)), 201


@app.route('/api/data/sessions/<session_id>', methods=['GET'])
def get_data_session(session_id):
    if not _valid_session_id(session_id):
        return jsonify(ok=False, error='Invalid session ID.'), 400
    with _data_lock:
        if not (_session_dir(session_id) / 'metadata.json').is_file():
            return jsonify(ok=False, error='Session not found.'), 404
        return jsonify(ok=True, session=_session_payload(session_id))


@app.route('/api/data/sessions/<session_id>/records/<category>', methods=['POST'])
def append_data_record(session_id, category):
    if not _valid_session_id(session_id):
        return jsonify(ok=False, error='Invalid session ID.'), 400
    if category not in DATA_CATEGORIES:
        return jsonify(ok=False, error='Unknown experimental data category.'), 400
    payload = request.get_json(silent=True) or {}
    record = payload.get('record', payload)
    if not isinstance(record, dict):
        return jsonify(ok=False, error='A record object is required.'), 400
    directory = _session_dir(session_id)
    with _data_lock:
        if not (directory / 'metadata.json').is_file():
            return jsonify(ok=False, error='Session not found.'), 404
        trial_id = record.get('trialId', '')
        if category != 'reacquisition-events' and (not isinstance(trial_id, str) or not trial_id.strip()):
            return jsonify(ok=False, error='Every experimental trial requires a unique trial ID.'), 400
        if trial_id and _trial_id_exists(directory, trial_id, category):
            return jsonify(ok=False, error='That trial ID already exists in this session.'), 409
        path = directory / f'{category}.json'
        records = _read_json(path, [])
        if not isinstance(records, list):
            records = []
        if record.get('recordId') and any(item.get('recordId') == record['recordId'] for item in records if isinstance(item, dict)):
            return jsonify(ok=False, error='That record already exists.'), 409
        record = dict(record)
        record.setdefault('createdAt', _utc_now())
        records.append(record)
        _write_json(path, records)
        metadata = _read_json(directory / 'metadata.json', {})
        metadata['updatedAt'] = _utc_now()
        _write_json(directory / 'metadata.json', metadata)
    return jsonify(ok=True, record=record)


@app.route('/api/video/<channel>')
def video(channel):
    if channel not in STREAM_PORTS:
        return jsonify(error='Unknown camera'), 404
    if channel in remote_camera.active:
        def frames():
            while channel in remote_camera.active:
                image = remote_camera.jpeg(channel)
                if image:
                    yield b'--FRAME\r\nContent-Type: image/jpeg\r\n\r\n' + image + b'\r\n'
                time.sleep(0.1)
        return Response(frames(), mimetype='multipart/x-mixed-replace; boundary=FRAME',
                        headers={'Cache-Control': 'no-store'})
    try:
        upstream = urllib.request.urlopen(f'http://127.0.0.1:{STREAM_PORTS[channel]}/video', timeout=3)
    except (OSError, urllib.error.URLError):
        return jsonify(error='Camera stream unavailable'), 503
    def chunks():
        try:
            while chunk := upstream.read(16384):
                yield chunk
        except OSError:
            pass
        finally:
            upstream.close()
    return Response(chunks(), content_type=upstream.headers.get('Content-Type'),
                    headers={'Cache-Control': 'no-store'})


@app.route("/")
def index():
    return send_from_directory(UI_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(UI_DIR, filename)


@app.route("/api/cameras")
def cameras():
    with _lock:
        if _is_running():
            return jsonify(
                ok=False,
                error="Stop the tracker before re-scanning for cameras.",
                cameras=[],
            ), 409

        found = _probe_cameras()
        found.extend([{'index': -1, 'label': 'Browser camera 1'},
                      {'index': -2, 'label': 'Browser camera 2'}])

    return jsonify(ok=True, cameras=found)


@app.route("/api/status")
def status():
    with _lock:
        running = _is_running()
        exit_code = None if running or not _processes else max(
            process.returncode for process in _processes.values()
        )
    return jsonify(running=running, exit_code=exit_code)


@app.route("/api/launch", methods=["POST"])
def launch():
    global _processes

    payload = request.get_json(silent=True) or {}
    try:
        camera_indices = {
            "A": int(payload["camera_a"]),
            "B": int(payload["camera_b"]),
        }
    except (KeyError, TypeError, ValueError):
        return jsonify(ok=False, error="Both camera_a and camera_b are required."), 400

    if camera_indices["A"] == camera_indices["B"]:
        return jsonify(ok=False, error="Select two different cameras for localization."), 400
    if any(index < -2 for index in camera_indices.values()):
        return jsonify(ok=False, error='Unknown camera source.'), 400

    with _lock:
        if _is_running():
            return jsonify(ok=False, error="Tracker is already running."), 409

        _reset_track_state()
        remote_camera.reset_active({name: str(-index) for name, index in camera_indices.items() if index < 0})

        try:
            if camera_indices["A"] == camera_indices["B"]:
                _processes = {
                    "A": subprocess.Popen(
                        _build_command(camera_indices["A"], "A", "B"),
                        cwd=str(ROOT),
                    )
                }
            else:
                _processes = {
                    name: subprocess.Popen(
                        _build_command(camera_index, name),
                        cwd=str(ROOT),
                    )
                    for name, camera_index in camera_indices.items()
                    if camera_index >= 0
                }
        except OSError as exc:
            for process in _processes.values():
                process.terminate()
            _processes = {}
            remote_camera.reset_active()
            return jsonify(ok=False, error=f"Could not start tracker: {exc}"), 500

    return jsonify(ok=True, pids={name: process.pid for name, process in _processes.items()}, camera_indices=camera_indices)


@app.route("/api/stop", methods=["POST"])
def stop():
    global _processes

    with _lock:
        if not _is_running():
            return jsonify(ok=False, error="Tracker is not running."), 409

        for process in _processes.values():
            process.terminate()
        for process in _processes.values():
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        _processes = {}
        remote_camera.reset_active()

    _reset_track_state()
    return jsonify(ok=True)


@app.route("/api/acquire", methods=["POST"])
def acquire():
    with _lock:
        if not _is_running():
            return jsonify(ok=False, error="Tracker is not running."), 409

    try:
        remote_camera.arm()
        for name, port in STREAM_PORTS.items():
            if name in remote_camera.active:
                continue
            command = urllib.request.Request(
                f"http://127.0.0.1:{port}/acquire",
                method="POST",
            )
            urllib.request.urlopen(command, timeout=0.5).close()
    except (urllib.error.URLError, OSError) as exc:
        return jsonify(ok=False, error=f"Could not request acquisition: {exc}"), 502

    return jsonify(ok=True)


@app.route("/api/track-start", methods=["POST"])
def track_start():
    """
    Arms independent full-frame orange-folder searches in both processes.
    The folder may already be visible or enter either camera later.
    """
    with _lock:
        if not _is_running():
            return jsonify(ok=False, error="Tracker is not running."), 409

    errors = {}
    remote_camera.arm()
    for name, port in STREAM_PORTS.items():
        if name in remote_camera.active:
            continue
        # A couple of retries: the subprocess may still be opening its
        # camera / starting its own tiny HTTP server right after launch.
        last_exc = None
        for attempt in range(4):
            try:
                command = urllib.request.Request(
                    f"http://127.0.0.1:{port}/arm",
                    method="POST",
                )
                urllib.request.urlopen(command, timeout=0.5).close()
                last_exc = None
                break
            except (urllib.error.URLError, OSError) as exc:
                last_exc = exc
                time.sleep(0.3)
        if last_exc is not None:
            errors[name] = str(last_exc)

    if errors:
        return jsonify(ok=False, error=f"Could not arm tracking: {errors}"), 502

    return jsonify(ok=True)


@app.route("/api/track", methods=["POST"])
def push_track():
    """
    Called by the tracker subprocess (not the browser) on every frame
    to report where the real OpenCV detector currently sees the
    object. Best-effort: the tracker keeps working standalone even if
    this never gets called (e.g. server.py isn't running).
    """
    payload = request.get_json(silent=True) or {}
    camera_name = request.args.get("camera", "A").upper()
    if camera_name not in _track_state:
        return jsonify(ok=False, error="Unknown camera."), 400

    valid, error = tracking_state.updateTrack(camera_name, payload)
    if not valid:
        return jsonify(ok=False, error=error), 400
    if error == "ignored":
        return jsonify(ok=True, ignored=True)

    return jsonify(ok=True)


@app.route("/api/track", methods=["GET"])
def get_track():
    """Polled by the browser UI to draw the real detected position."""
    camera_name = request.args.get("camera", "A").upper()
    if camera_name not in _track_state:
        return jsonify(ok=False, error="Unknown camera."), 400
    with _track_lock:
        state = dict(_track_state[camera_name])
        linked = False  # Timing alone cannot establish physical object identity.
    if camera_name in remote_camera.active:
        state = dict(locked=False, cx=None, cy=None, frame_w=None, frame_h=None,
                     updated_at=0, captured_at=0, state='UNAVAILABLE')
        state.update(remote_camera.measurement(camera_name))

    fresh = bool(state["updated_at"]) and (
        time.time() - state.get("captured_at", 0) < TRACK_STALE_SECONDS
    )
    if not fresh:
        state.update(locked=False, cx=None, cy=None, bbox=None, state="UNAVAILABLE")
    return jsonify(ok=True, fresh=fresh, linked=linked, **state)


if __name__ == "__main__":
    import argparse
    from werkzeug.serving import make_server
    parser = argparse.ArgumentParser(description='AERESCUE console and browser camera receiver')
    parser.add_argument('--cert', help='Trusted TLS certificate PEM for remote browser cameras')
    parser.add_argument('--key', help='TLS private key PEM')
    parser.add_argument('--https-port', type=int, default=5443)
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error('--cert and --key must be supplied together')
    if args.cert:
        https = make_server('0.0.0.0', args.https_port, app, threaded=True,
                            ssl_context=(args.cert, args.key))
        threading.Thread(target=https.serve_forever, daemon=True).start()
        print(f'Browser camera sharing: https://<this-laptop-IP>:{args.https_port}/camera')
    print("AERESCUE console: http://127.0.0.1:5000")
    print("Press SPACE in the tracker window to acquire, Q to quit it.")
    app.run(host="0.0.0.0", port=5000, debug=False)
