"""Compatibility entry point for the active orange-folder tracker."""

from orange_object_tracker.models import Observation
from orange_object_tracker.orange import OrangeFolderTracker, drawObservation


draw_observation = drawObservation

__all__ = [
    "Observation",
    "OrangeFolderTracker",
    "drawObservation",
    "draw_observation",
]
