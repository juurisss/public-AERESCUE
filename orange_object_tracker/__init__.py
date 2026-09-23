"""
orange_object_tracker

Track the orange-folder rescue-platform surrogate from a camera feed.

Modules:
    config    - camera defaults
    models    - per-frame observations
    color_detection - orange candidate detection
    orange    - stateful orange-folder tracking
    app       - OpenCV capture/display loop and CLI entry point
"""

from .app import main, run
from .orange import OrangeFolderTracker
from .models import Observation

__all__ = ["main", "run", "OrangeFolderTracker", "Observation"]
