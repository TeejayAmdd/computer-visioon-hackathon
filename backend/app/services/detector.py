from io import BytesIO
import logging
from pathlib import Path
from threading import Lock
from typing import Any

from PIL import Image, UnidentifiedImageError

from app.schemas.detection import (
    BoundingBox,
    Detection,
    Distance,
    DistanceMethod,
    HorizontalPosition,
    VerticalPosition,
    Zone,
)


class InvalidImageError(ValueError):
    """Raised when an uploaded payload is not a readable image."""


class ModelUnavailableError(RuntimeError):
    """Raised when inference is requested before the YOLO model is available."""


class Detector:
    # Typical object heights in metres. These are priors, not measurements; the
    # reported distance is deliberately marked as approximate in the API.
    _REFERENCE_HEIGHTS = {
        "person": 1.7,
        "bicycle": 1.1,
        "car": 1.5,
        "motorcycle": 1.2,
        "bus": 3.2,
        "truck": 3.0,
        "traffic light": 0.7,
        "stop sign": 0.75,
        "fire hydrant": 0.75,
        "bench": 0.8,
        "chair": 0.9,
        "cow": 1.4,
        "horse": 1.6,
        "sheep": 0.8,
        "dog": 0.6,
        "cat": 0.3,
    }

    def __init__(self, model_path: Path, confidence_threshold: float) -> None:
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.model: Any = None
        self.mode = "fallback"
        self.load_error: str | None = None
        self._inference_lock = Lock()

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    def load(self) -> None:
        can_download_default = self.model_path.name in {"yolo11n.pt", "yolov8n.pt"}
        if not self.model_path.exists() and not can_download_default:
            self.load_error = f"YOLO model not found at: {self.model_path}"
            logging.error(self.load_error)
            return
        try:
            from ultralytics import YOLO

            self.model = YOLO(str(self.model_path))
            self.mode = "yolo"
            self.load_error = None
        except Exception as exc:
            self.model = None
            self.mode = "fallback"
            self.load_error = (
                f"Could not load YOLO model at {self.model_path}: "
                f"{type(exc).__name__}: {exc}"
            )
            logging.exception("Could not load YOLO model from %s", self.model_path)

    def detect(self, image_bytes: bytes) -> list[Detection]:
        image = self._read_image(image_bytes)
        if self.model is None:
            raise ModelUnavailableError(
                self.load_error or "The YOLO model is not loaded."
            )
        return self._run_yolo(image)

    @staticmethod
    def _read_image(image_bytes: bytes) -> Image.Image:
        try:
            image = Image.open(BytesIO(image_bytes))
            image.load()
            return image.convert("RGB")
        except (UnidentifiedImageError, OSError) as exc:
            raise InvalidImageError("The uploaded file is not a readable image.") from exc

    def _run_yolo(self, image: Image.Image) -> list[Detection]:
        with self._inference_lock:
            results = self.model.predict(
                source=image,
                conf=self.confidence_threshold,
                verbose=False,
            )
        detections: list[Detection] = []
        for result in results:
            names = result.names
            for box, confidence, class_id in zip(
                result.boxes.xyxy.tolist(),
                result.boxes.conf.tolist(),
                result.boxes.cls.tolist(),
            ):
                x1, y1, x2, y2 = box
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2
                label = str(names[int(class_id)])
                zone = self._zone(center_x, image.width)
                distance = self._distance(x1, y1, x2, y2, image.width, image.height)
                horizontal_position = self._horizontal_position(center_x, image.width)
                vertical_position = self._vertical_position(center_y, image.height)
                distance_meters, distance_confidence, distance_method = self._estimate_distance(
                    label, y1, y2, image.height
                )
                navigation_relevant, navigation_reason = self._navigation_relevance(
                    label, distance, horizontal_position, vertical_position
                )
                detections.append(
                    Detection(
                        label=label,
                        confidence=float(confidence),
                        zone=zone,
                        distance=distance,
                        distance_meters=distance_meters,
                        distance_confidence=distance_confidence,
                        distance_method=distance_method,
                        relative_depth=self._relative_depth(y1, y2, image.height),
                        horizontal_position=horizontal_position,
                        vertical_position=vertical_position,
                        navigation_relevant=navigation_relevant,
                        navigation_reason=navigation_reason,
                        box=BoundingBox(
                            x1=(x1 / image.width) * 100,
                            y1=(y1 / image.height) * 100,
                            x2=(x2 / image.width) * 100,
                            y2=(y2 / image.height) * 100,
                        ),
                    )
                )
        return detections

    @staticmethod
    def _zone(center_x: float, width: int) -> Zone:
        ratio = center_x / width
        if ratio < 1 / 3:
            return "left"
        if ratio > 2 / 3:
            return "right"
        return "center"

    @staticmethod
    def _horizontal_position(center_x: float, width: int) -> HorizontalPosition:
        ratio = center_x / width
        if ratio < 1 / 7:
            return "far-left"
        if ratio < 2 / 7:
            return "left"
        if ratio < 3 / 7:
            return "center-left"
        if ratio < 4 / 7:
            return "center"
        if ratio < 5 / 7:
            return "center-right"
        if ratio < 6 / 7:
            return "right"
        return "far-right"

    @staticmethod
    def _vertical_position(center_y: float, height: int) -> VerticalPosition:
        ratio = center_y / height
        if ratio < 0.35:
            return "above"
        if ratio > 0.68:
            return "below"
        return "eye-level"

    @classmethod
    def _estimate_distance(
        cls, label: str, y1: float, y2: float, image_height: int
    ) -> tuple[float | None, float, DistanceMethod]:
        pixel_height = max(y2 - y1, 1)
        reference_height = cls._REFERENCE_HEIGHTS.get(label.lower())
        if reference_height is None:
            return None, 0.25, "relative-bounding-box"

        # A pinhole-camera estimate: distance ~= focal_length * real_height /
        # pixel_height. Without camera calibration, focal length is approximated
        # as the image height, so this is useful for guidance, not surveying.
        estimated = (image_height * reference_height) / pixel_height
        return round(max(estimated, 0.1), 1), 0.45, "monocular-height-prior"

    @staticmethod
    def _relative_depth(y1: float, y2: float, image_height: int) -> float:
        # Larger visible objects are generally closer. This is relative depth,
        # not a metric depth prediction.
        return round(min(max((y2 - y1) / image_height, 0.0), 1.0), 3)

    @staticmethod
    def _navigation_relevance(
        label: str,
        distance: Distance,
        horizontal_position: HorizontalPosition,
        vertical_position: VerticalPosition,
    ) -> tuple[bool, str]:
        navigation_labels = {
            "person", "bicycle", "car", "motorcycle", "bus", "truck",
            "traffic light", "stop sign", "bench", "fire hydrant",
        }
        in_path = horizontal_position in {"center-left", "center", "center-right"}
        relevant = label.lower() in navigation_labels and in_path and vertical_position != "above"
        if relevant and distance == "near":
            return True, "potential obstacle in the forward path"
        if relevant:
            return True, "navigation-relevant object near the forward path"
        if label.lower() in navigation_labels:
            return True, "navigation landmark or moving object"
        return False, "not classified as a primary navigation hazard"

    @staticmethod
    def _distance(x1: float, y1: float, x2: float, y2: float, width: int, height: int) -> Distance:
        area_ratio = ((x2 - x1) * (y2 - y1)) / (width * height)
        if area_ratio >= 0.25:
            return "near"
        if area_ratio >= 0.08:
            return "mid"
        return "far"
