from dataclasses import dataclass


@dataclass(frozen=True)
class Observation:
    valid: bool = False
    state: str = "NOT_VISIBLE"
    center: tuple[float, float] | None = None
    bbox: tuple[int, int, int, int] | None = None
    area: float | None = None
    confidence: float = 0.0
