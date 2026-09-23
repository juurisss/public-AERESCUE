# AERESCUE codebase explanation

AERESCUE is a shore-based, dual-camera computer-vision prototype for simulated water-rescue scenarios. The system tracks an orange-folder surrogate, combines observations from cameras A and B, estimates the target and moving object's relative position, and produces directional guidance such as `LEFT`, `RIGHT`, `FORWARD`, and `STOP/HOLD`.

The repository has three main runtime layers:

<img width="2158" height="1985" alt="Untitled diagram-2026-09-23-020346" src="https://github.com/user-attachments/assets/4a9977df-a2c6-4a53-beee-561f93bb05d2" />

The browser polls the server for tracking measurements. The tracker reports observations to the server, while the browser performs the display-side triangulation, relative-distance calculations, and guidance presentation.

## Runtime flow

1. Start `server.py`. It serves the main console at `http://127.0.0.1:5000` and exposes the API used by the browser.
2. The console calls `/api/cameras` to discover local OpenCV cameras and also exposes two browser-camera slots.
3. `/api/launch` starts tracking. Local cameras run in tracker subprocesses; browser cameras send JPEG frames to the `remote_camera` blueprint inside the Flask process.
4. Each tracker detects the orange object, publishes an MJPEG preview, and reports its latest observation through `POST /api/track?camera=A|B`.
5. `backend/tracking_state.py` keeps the newest valid observation for each camera. The console reads it through `GET /api/track?camera=A|B`.
6. The operator marks the simulated rescue target in both feeds. `ui/app.js` uses the two camera measurements and calibration values to render the geometry and guidance output.
7. The optional data-collection page records trials under `data/sessions/<session-id>/` through the session API.

## Root-level entry points

### `server.py`

The main Flask application. It:

- serves `ui/`, the calibration page, and the data-collection page;
- discovers cameras and manages tracker processes;
- proxies tracker MJPEG streams at `/api/video/A` and `/api/video/B`;
- exposes tracker control routes such as `/api/launch`, `/api/stop`, `/api/acquire`, and `/api/track-start`;
- accepts tracker observations and returns live tracking state;
- creates, reads, and appends experimental data sessions; and
- optionally starts an HTTPS listener for remote browser cameras when `--cert` and `--key` are supplied.

### `run_tracker.py`

Small command-line entry point that calls `orange_object_tracker.app.main()`. `server.py` uses it when it launches a local-camera tracker subprocess.

### `remote_camera.py`

Flask blueprint for browser cameras. It authenticates camera slots with short-lived tokens and frame tickets, accepts JPEG uploads, runs the same orange-folder tracker on uploaded frames, and stores the latest annotated JPEG and measurement for the console.

### `orange_tracker.py`

Compatibility wrapper that re-exports `Observation`, `OrangeFolderTracker`, and drawing helpers from `orange_object_tracker/`. Older scripts can import the tracker without knowing its package location.

### `validate_tracker.py`

Offline tracker evaluation tool. It replays one or more videos, writes an annotated MP4, CSV frame measurements, a JSON state summary, and review contact sheets to `diagnostics/tracker/` by default.

## `backend/`

Reusable server-side state and storage helpers. It is not a second HTTP server.

- `data_store.py` defines the experimental data categories, validates session IDs, reads and atomically writes JSON files, loads a complete session payload, and checks trial-ID uniqueness.
- `tracking_state.py` owns the in-memory state for cameras A and B. It validates timestamps and coordinates, rejects out-of-order observations, records tracker states, and marks observations stale after one second.
- `__init__.py` makes the directory importable as the `backend` Python package.

## `orange_object_tracker/`

The active computer-vision tracker.

- `app.py` opens a camera with OpenCV, warms it up, handles arm/acquire commands, runs the tracker for each frame, draws annotations, serves a small local MJPEG endpoint, and posts measurements to `server.py`.
- `color_detection.py` converts frames to HSV, creates an orange mask, filters contours by size and shape, and produces candidate observations.
- `orange.py` selects candidates and maintains temporal continuity. It confirms a newly found candidate across multiple frames and reports states such as `ACQUIRING`, `ACQUIRED`, `TRACKING`, `REACQUIRED`, and `LOST`.
- `models.py` defines the immutable `Observation` record shared by detection, tracking, and drawing code.
- `config.py` contains tracker defaults such as the local camera index.

The tracker is deliberately independent enough to run without the Flask server. If reporting fails, local detection and preview can continue; the console simply will not receive fresh measurements.

## `ui/`

The main operator console and camera tools.

- `index.html`, `app.js`, and `styles.css` implement the two-camera console, target marking, live tracking status, triangulation display, relative-distance calculations, and guidance presentation.
- `calibrate.html`, `calibrate.js`, and `calibrate.css` provide calibration controls and previews. (experimental)
- `camera.html`, `camera.js`, and `camera.css` let a remote device share its camera through the browser-camera API.
- `heading-calibration.js` contains the heading-calibration workflow used by the console. (experimental)

The UI is plain browser JavaScript; there is no frontend build step. `server.py` serves these files directly.

## `data-collection/`

Separate experimental data-collection page, served at `/data-collection`. It provides session management, trial forms, summaries, and exports.

- `app.js` coordinates the page, samples live tracking data, captures guidance results, and saves records through the server API.
- `metrics.js` contains client-side summaries such as tracking success percentages, error summaries, and guidance confusion matrices.
- `index.html` and `styles.css` define the page.

## `data/`

Data collected. Each session is stored as JSON files in `data/sessions/<session-id>/`

## `data/sessions/AERESCUE-2026-09-22-01/`
Contains raw data collected during for the District Level

## Supporting directories

- `assets/` - sample media used for tracker development and validation. The public repository may not contain every original sample.
- `diagnostics/` - generated tracker-review outputs and other diagnostic artifacts.
- `graph/` - scripts and generated figures used to analyze or illustrate experiment results.
- `testing/` - browser, API, geometry, remote-camera, runtime, and tracker-related tests.
- `docs/` - project documentation and presentation material.

## Where to make common changes

| Change | Main files |
| --- | --- |
| Detection thresholds or orange segmentation | `orange_object_tracker/color_detection.py` |
| Candidate continuity, acquisition, or reacquisition behavior | `orange_object_tracker/orange.py` |
| Camera process, stream, or tracker reporting | `orange_object_tracker/app.py`, `server.py` |
| Browser-camera authentication and uploads | `remote_camera.py`, `ui/camera.js` |
| Live server state or JSON persistence | `backend/tracking_state.py`, `backend/data_store.py`, `server.py` |
| Triangulation, distance, or guidance display | `ui/app.js` |
| Experimental record format or summaries | `data-collection/app.js`, `data-collection/metrics.js`, `server.py` |

## Running the system

From the repository root:

```powershell
python server.py
```

Then open `http://127.0.0.1:5000`. For a standalone tracker preview, use `python run_tracker.py`; its camera and stream behavior can be adjusted with the command-line options defined in `orange_object_tracker/app.py`.

The system is a research prototype for controlled simulated conditions. It should not be treated as an autonomous rescue system or as a substitute for trained operators and physical safety procedures.
