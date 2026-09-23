import argparse
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2

from . import config
from .models import Observation
from .orange import OrangeFolderTracker, drawObservation

DEFAULT_TRACK_URL = "http://127.0.0.1:5000/api/track"

DEFAULT_STREAM_PORT = 5001

CAMERA_WARMUP_RETRIES = 20
CAMERA_WARMUP_DELAY = 0.15


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Track the orange-folder rescue-platform surrogate.")
    parser.add_argument(
        "--camera",
        type=int,
        default=config.CAMERA_INDEX,
        help="Camera index to open (default: %(default)s).",
    )
    parser.add_argument(
        "--track-url",
        default=DEFAULT_TRACK_URL,
        help="POST target for per-frame detection reports (default: %(default)s). "
        "Pass an empty string to disable reporting entirely.",
    )
    parser.add_argument(
        "--track-camera",
        default="A",
        help="Comma-separated camera names used when reporting tracking state.",
    )
    parser.add_argument(
        "--mirror-stream-port",
        type=int,
        default=0,
        help="Optional second port serving the same camera stream.",
    )
    parser.add_argument(
        "--stream-port",
        type=int,
        default=DEFAULT_STREAM_PORT,
        help="Local port to serve the MJPEG video feed on (default: %(default)s). "
        "Pass 0 to disable video streaming.",
    )
    parser.add_argument(
        "--entry-side",
        choices=["left", "right", "none"],
        default="none",
        help="Side of THIS camera's frame that faces the gap between the two "
        "cameras - i.e. the side a new object will actually walk in from. "
        "'none' searches the whole frame (default: %(default)s).",
    )
    return parser.parse_args()


def _open_camera(camera_index: int) -> "cv2.VideoCapture | None":
    if sys.platform == "win32":
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    else:
        backends = [None]

    for backend in backends:
        cap = (
            cv2.VideoCapture(camera_index, backend)
            if backend is not None
            else cv2.VideoCapture(camera_index)
        )

        if not cap.isOpened():
            cap.release()
            continue

        for attempt in range(CAMERA_WARMUP_RETRIES):
            ok, frame = cap.read()
            if ok and frame is not None:
                return cap
            time.sleep(CAMERA_WARMUP_DELAY)

        cap.release()

    return None


def _report_track(track_url: str, locked: bool, center, frame_w: int, frame_h: int, observation=None) -> None:
    if not track_url:
        return

    payload = json.dumps(
        {
            "locked": bool(locked and center is not None),
            "cx": center[0] if center else None,
            "cy": center[1] if center else None,
            "frame_w": frame_w,
            "frame_h": frame_h,
            "state": observation.state if observation else "LOST",
            "bbox": observation.bbox if observation else None,
            "confidence": observation.confidence if observation else 0,
            "captured_at": time.time(),
        }
    ).encode("utf-8")

    def _send():
        try:
            req = urllib.request.Request(
                track_url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=0.25).close()
        except (urllib.error.URLError, OSError):
            pass

    # Serialize reports so a delayed measurement cannot overwrite a later loss.
    _send()

_latest_jpeg_lock = threading.Lock()
_latest_jpeg: "bytes | None" = None
_acquire_event = threading.Event()
_arm_event = threading.Event()


def _publish_frame(frame) -> None:
    global _latest_jpeg
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        return
    with _latest_jpeg_lock:
        _latest_jpeg = buf.tobytes()


class _MJPEGHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        path = self.path.split("?", 1)[0]

        if path == "/acquire":
            _acquire_event.set()
            self.send_response(202)
            self.end_headers()
            return

        if path == "/arm":
            _arm_event.set()
            self.send_response(202)
            self.end_headers()
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path.split("?", 1)[0] != "/video":
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Age", "0")
        self.send_header("Cache-Control", "no-cache, private")
        self.send_header("Pragma", "no-cache")
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=FRAME")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            while True:
                with _latest_jpeg_lock:
                    jpeg = _latest_jpeg
                if jpeg is not None:
                    break
                time.sleep(0.05)

            while True:
                with _latest_jpeg_lock:
                    jpeg = _latest_jpeg
                if jpeg is not None:
                    self.wfile.write(b"--FRAME\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode())
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
                time.sleep(1 / 30)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def log_message(self, format, *args):
        pass


def _start_stream_server(port: int) -> "ThreadingHTTPServer | None":
    if not port:
        return None
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), _MJPEGHandler)
    except OSError as exc:
        print(f"Could not start video stream on port {port}: {exc}")
        return None
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Live video stream: http://127.0.0.1:{port}/video")
    return server


def run(
    camera_index: int = config.CAMERA_INDEX,
    track_url: str = DEFAULT_TRACK_URL,
    track_camera: str = "A",
    stream_port: int = DEFAULT_STREAM_PORT,
    mirror_stream_port: int = 0,
    entry_side: "str | None" = None,
) -> None:
    cap = _open_camera(camera_index)

    if cap is None:
        print(
            "Could not open camera (or it never produced a frame after "
            f"{CAMERA_WARMUP_RETRIES} retries). If a browser tab has this "
            "camera open for live preview, close that preview first - most "
            "webcams only allow one consumer at a time."
        )
        return

    stream_servers = [
        server
        for server in (
            _start_stream_server(stream_port),
            _start_stream_server(mirror_stream_port),
        )
        if server is not None
    ]
    track_cameras = [name.strip().upper() for name in track_camera.split(",") if name.strip()]
    tracker = OrangeFolderTracker()

    # Tracking does NOT start just because the camera opened. It only
    # starts once armed (via /arm, triggered by the "Track object"
    # button) or a manual /acquire, both below. Until then this is
    # just a live preview with nothing being searched for.
    armed = False

    print("Controls: SPACE = arm/acquire, Q = quit")

    try:
        while True:
            ok, frame = cap.read()

            if not ok:
                for camera_name in track_cameras:
                    _report_track(f"{track_url}?camera={camera_name}", False, None, 0, 0)
                print("Failed to read frame from camera.")
                break

            frame_h, frame_w = frame.shape[:2]

            if _arm_event.is_set():
                _arm_event.clear()
                tracker.reset()
                armed = True
                print("Armed: searching the full frame for the orange folder")

            if _acquire_event.is_set():
                _acquire_event.clear()
                tracker.reset()
                armed = True
            result = tracker.update(frame) if armed else Observation(state="STANDBY")
            drawObservation(frame, result)
            for camera_name in track_cameras:
                _report_track(f"{track_url}?camera={camera_name}", result.valid, result.center, frame_w, frame_h, result)

            _publish_frame(frame)
            cv2.imshow("AERESCUE orange-folder surrogate", frame)

            key = cv2.waitKey(1) & 0xFF

            if key == ord("q"):
                break
            elif key == ord(" "):
                armed = True
                tracker.reset()

    finally:
        cap.release()
        cv2.destroyAllWindows()
        for stream_server in stream_servers:
            stream_server.shutdown()


def main() -> None:
    args = parse_args()
    run(
        camera_index=args.camera,
        track_url=args.track_url,
        track_camera=args.track_camera,
        stream_port=args.stream_port,
        mirror_stream_port=args.mirror_stream_port,
        entry_side=None if args.entry_side == "none" else args.entry_side,
    )


if __name__ == "__main__":
    main()
