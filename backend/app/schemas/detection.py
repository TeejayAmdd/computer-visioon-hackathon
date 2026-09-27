from typing import Literal

from pydantic import BaseModel, Field

Zone = Literal["left", "center", "right"]
Distance = Literal["near", "mid", "far"]
HorizontalPosition = Literal[
    "far-left",
    "left",
    "center-left",
    "center",
    "center-right",
    "right",
    "far-right",
]
VerticalPosition = Literal["above", "eye-level", "below"]
DistanceMethod = Literal["monocular-height-prior", "relative-bounding-box"]


class BoundingBox(BaseModel):
    x1: float = Field(ge=0)
    y1: float = Field(ge=0)
    x2: float = Field(ge=0)
    y2: float = Field(ge=0)


class Detection(BaseModel):
    label: str = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)
    zone: Zone
    distance: Distance
    distance_meters: float | None = Field(default=None, gt=0)
    distance_confidence: float = Field(ge=0, le=1)
    distance_method: DistanceMethod
    relative_depth: float = Field(ge=0, le=1)
    horizontal_position: HorizontalPosition
    vertical_position: VerticalPosition
    navigation_relevant: bool
    navigation_reason: str
    box: BoundingBox


class DetectionResponse(BaseModel):
    detections: list[Detection]
