import cv2
import numpy as np

from .models import Observation


REFERENCE_AREA = 640 * 368


def findCandidates(frame, minArea=None, allowThin=False):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    areaScale = (frame.shape[0] * frame.shape[1]) / REFERENCE_AREA
    lowResolutionThin = allowThin and areaScale < 0.75

    minSaturation = 80 if lowResolutionThin else 90
    mask = cv2.inRange(hsv, (1, minSaturation, 20), (26, 255, 255))

    if lowResolutionThin:
        mask[hsv[:, :, 2] < 20] = 0
    else:
        mask[(hsv[:, :, 2] < 155) & (hsv[:, :, 1] < 190)] = 0

    kernelSize = 3 if (not allowThin or areaScale >= 0.75) else 2
    kernel = np.ones((kernelSize, kernelSize), np.uint8)

    if not allowThin or areaScale >= 0.75:
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if minArea is None:
        legacyFloor = max(60, frame.shape[0] * frame.shape[1] * 0.00015)
        scaledFloor = 60 * areaScale
        minArea = max(8, min(legacyFloor, scaledFloor))
    elif allowThin:
        minArea = max(1, minArea * areaScale)

    candidates = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < minArea:
            continue

        x, y, width, height = cv2.boundingRect(contour)
        (_, _), (rotatedWidth, rotatedHeight), _ = cv2.minAreaRect(contour)
        linearScale = min(1.0, areaScale ** 0.5)
        minDimension = max(1, (2 if allowThin else 5) * linearScale)
        maxAspectRatio = 12 if allowThin else 6

        if min(rotatedWidth, rotatedHeight) < minDimension:
            continue
        if max(rotatedWidth, rotatedHeight) / min(rotatedWidth, rotatedHeight) > maxAspectRatio:
            continue

        solidity = area / max(cv2.contourArea(cv2.convexHull(contour)), 1)
        rectangularity = area / max(rotatedWidth * rotatedHeight, 1)
        minSolidity = 0.45 if allowThin else 0.60
        minRectangularity = 0.25 if allowThin else 0.45
        if solidity < minSolidity or rectangularity < minRectangularity:
            continue

        region = np.zeros((height, width), np.uint8)
        cv2.drawContours(region, [contour - (x, y)], -1, 255, -1)
        pixels = hsv[y:y + height, x:x + width][region > 0]
        medianSaturation = np.median(pixels[:, 1])
        medianValue = np.median(pixels[:, 2])

        if medianSaturation < (70 if lowResolutionThin else 90):
            continue
        if medianValue < (20 if lowResolutionThin else 25):
            continue
        if not lowResolutionThin and medianValue < 155:
            if np.median(pixels[:, 1]) < 210 or solidity < 0.85 or rectangularity < 0.75:
                continue

        confidence = min(1.0, solidity * rectangularity)
        candidates.append(Observation(
            True,
            "TRACKING",
            (x + width / 2, y + height / 2),
            (x, y, width, height),
            area,
            confidence,
        ))

    return sorted(candidates, key=lambda candidate: candidate.area, reverse=True), mask


def isContinuous(first, second):
    if first is None or second is None:
        return False

    distance = ((first.center[0] - second.center[0]) ** 2 +
                (first.center[1] - second.center[1]) ** 2) ** 0.5
    return distance <= max(25, max(first.bbox[2:]) * 1.5, max(second.bbox[2:]) * 1.5)


def isPlausiblyContinuous(first, second):
    if not isContinuous(first, second):
        return False

    previousArea = max(first.area or (first.bbox[2] * first.bbox[3]), 1)
    candidateArea = max(second.area or (second.bbox[2] * second.bbox[3]), 1)
    return candidateArea <= max(previousArea * 8, 50)
