import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    model_path: Path = Path(
        os.getenv(
            "YOLO_MODEL_PATH",
            os.getenv("MODEL_PATH", "models/teammate_model/best.pt"),
        )
    )
    fallback_model_path: Path = BASE_DIR / "models" / "base" / "yolo11n.pt"
    confidence_threshold: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))
    elevenlabs_api_key: str | None = os.getenv("ELEVENLABS_API_KEY") or None
    elevenlabs_model_id: str = os.getenv(
        "ELEVENLABS_MODEL_ID", "eleven_flash_v2_5"
    )
    elevenlabs_default_voice_id: str | None = (
        os.getenv("ELEVENLABS_DEFAULT_VOICE_ID") or None
    )
    allowed_origins: list[str] | None = None

    def __post_init__(self) -> None:
        if not self.model_path.is_absolute():
            object.__setattr__(
                self,
                "model_path",
                BASE_DIR / self.model_path,
            )
        if self.allowed_origins is None:
            configured_origins = os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            object.__setattr__(
                self,
                "allowed_origins",
                [
                    origin.strip()
                    for origin in [
                        *configured_origins,
                        "https://chreey-eye-detection.netlify.app",
                    ]
                    if origin.strip()
                ],
            )


settings = Settings()
