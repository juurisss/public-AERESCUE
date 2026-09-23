import math
import threading
import time


TRACK_STALE_SECONDS = 1.0

trackLock = threading.Lock()
trackState = {
    "A": {"locked": False, "cx": None, "cy": None, "frame_w": None,
           "frame_h": None, "updated_at": 0.0},
    "B": {"locked": False, "cx": None, "cy": None, "frame_w": None,
           "frame_h": None, "updated_at": 0.0},
}

def resetTrackState():
    with trackLock:
        for state in trackState.values():
            state.clear()
            state.update(
                locked=False,
                cx=None,
                cy=None,
                frame_w=None,
                frame_h=None,
                updated_at=0.0,
                captured_at=0.0,
                state="NOT_VISIBLE",
            )



def updateTrack(cameraName, payload):
    def finite(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

    centerX, centerY = payload.get("cx"), payload.get("cy")
    width, height = payload.get("frame_w"), payload.get("frame_h")
    captured = payload.get("captured_at")

    if not finite(captured) or captured > time.time() + 1:
        return False, "Invalid observation timestamp."

    nowLocked = bool(payload.get("locked")) and all(
        finite(value) for value in (centerX, centerY, width, height)
    )
    nowLocked = nowLocked and width > 0 and height > 0 and 0 <= centerX < width and 0 <= centerY < height

    with trackLock:
        state = trackState[cameraName]
        if captured <= state.get("captured_at", 0):
            return True, "ignored"

        state.update(
            locked=nowLocked,
            cx=centerX if nowLocked else None,
            cy=centerY if nowLocked else None,
            captured_at=captured,
            state=payload.get("state", "TRACKING") if nowLocked else "LOST",
            bbox=payload.get("bbox") if nowLocked else None,
            confidence=payload.get("confidence", 0) if nowLocked else 0,
            frame_w=payload.get("frame_w"),
            frame_h=payload.get("frame_h"),
            updated_at=time.time(),
        )

    return True, None
