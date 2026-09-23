import cv2

from . import color_detection
from .models import Observation


class OrangeFolderTracker:
    def __init__(self):
        self.reset()

    @staticmethod
    def candidates(frame, min_area=None, allow_thin=False):
        return color_detection.findCandidates(frame, min_area, allow_thin)

    def reset(self):
        self.last_observation = Observation()
        self.last_valid = None
        self._pending = None
        self._confirmations = 0

    def update(self, frame):
        previous = self.last_observation
        reference = previous if previous.valid else self.last_valid
        trackingExistingLock = reference is not None

        candidates, _ = self.candidates(frame)
        best = candidates[0] if candidates else None

        if trackingExistingLock and candidates:
            nearby = [candidate for candidate in candidates
                      if color_detection.isPlausiblyContinuous(reference, candidate)]
            if nearby:
                best = min(
                    nearby,
                    key=lambda candidate: (
                        (candidate.center[0] - reference.center[0]) ** 2 +
                        (candidate.center[1] - reference.center[1]) ** 2
                    ),
                )

        if trackingExistingLock and not (
            best is not None and color_detection.isPlausiblyContinuous(reference, best)
        ):
            candidates, _ = self.candidates(frame, min_area=4, allow_thin=True)
            nearby = [candidate for candidate in candidates
                      if color_detection.isPlausiblyContinuous(reference, candidate)]
            if nearby:
                best = min(
                    nearby,
                    key=lambda candidate: (
                        (candidate.center[0] - reference.center[0]) ** 2 +
                        (candidate.center[1] - reference.center[1]) ** 2
                    ),
                )
            else:
                best = candidates[0] if candidates else None

        if len(candidates) > 1 and best is candidates[0] and candidates[1].area > best.area * 0.60:
            best = None

        if best is None:
            self._pending = None
            self._confirmations = 0
            result = Observation(state="LOST" if self.last_valid else "NOT_VISIBLE")
        elif ((previous.valid or self.last_valid is not None) and
              color_detection.isPlausiblyContinuous(
                  previous if previous.valid else self.last_valid,
                  best,
              )):
            result = best
        else:
            stable = color_detection.isContinuous(self._pending, best)
            self._confirmations = self._confirmations + 1 if stable else 1
            self._pending = best
            if self._confirmations >= 3:
                result = Observation(
                    True,
                    "REACQUIRED" if self.last_valid else "ACQUIRED",
                    best.center,
                    best.bbox,
                    best.area,
                    best.confidence,
                )
            else:
                result = Observation(state="ACQUIRING")

        if result.valid:
            self.last_valid = result
            self._pending = None
            self._confirmations = 0

        self.last_observation = result
        return result


def drawObservation(frame, observation):
    if observation.valid:
        x, y, width, height = observation.bbox
        cv2.rectangle(frame, (x, y), (x + width, y + height), (0, 255, 0), 2)
        cv2.circle(frame, tuple(round(value) for value in observation.center), 3, (0, 255, 0), -1)

    cv2.putText(
        frame,
        observation.state,
        (10, 25),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 255, 0) if observation.valid else (0, 165, 255),
        2,
    )
