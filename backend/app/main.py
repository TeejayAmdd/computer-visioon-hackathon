from contextlib import asynccontextmanager
import logging
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.schemas.detection import DetectionResponse
from app.services.detector import Detector, InvalidImageError, ModelUnavailableError

detector = Detector(settings.model_path, settings.confidence_threshold)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    detector.load()
    yield


app = FastAPI(
    title="Sightline Accessibility Assistant API",
    description="Image detection and spatial awareness API for the Sightline assistant.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str | bool | None]:
    return {
        "status": "ok" if detector.is_loaded else "degraded",
        "model_loaded": detector.is_loaded,
        "detector_mode": detector.mode,
        "model_path": str(detector.model_path),
        "model_error": detector.load_error,
    }


@app.post("/detect", response_model=DetectionResponse)
async def detect(file: Annotated[UploadFile, File(description="Image frame to analyze")]):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="The uploaded file must be an image.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")

    try:
        detections = await run_in_threadpool(detector.detect, image_bytes)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Image detection failed")
        raise HTTPException(status_code=500, detail="Image detection failed.") from exc

    return DetectionResponse(detections=detections)


@app.websocket("/ws/detect")
async def detect_stream(websocket: WebSocket):
    """Analyze sequential binary image frames sent over one WebSocket connection."""
    await websocket.accept()

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            frame = message.get("bytes")
            if frame is None:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": "Send each video frame as binary JPEG or PNG data.",
                    }
                )
                continue

            if not frame:
                await websocket.send_json(
                    {"type": "error", "detail": "The uploaded video frame is empty."}
                )
                continue

            try:
                detections = await run_in_threadpool(detector.detect, frame)
            except InvalidImageError as exc:
                await websocket.send_json({"type": "error", "detail": str(exc)})
                continue
            except ModelUnavailableError as exc:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": f"Detector unavailable on the server: {exc}",
                    }
                )
                continue
            except Exception:
                await websocket.send_json(
                    {"type": "error", "detail": "Video frame detection failed."}
                )
                continue

            await websocket.send_json(
                {
                    "type": "detections",
                    "detections": [detection.model_dump() for detection in detections],
                }
            )
    except WebSocketDisconnect:
        return
