import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    model_path: Path = Path(
        os.getenv(
            "MODEL_PATH",
            str(Path(__file__).resolve().parents[1] / "models" / "yolo11n.pt"),
        )
    )
    confidence_threshold: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))
    allowed_origins: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if not self.model_path.is_absolute():
            object.__setattr__(
                self,
                "model_path",
                Path(__file__).resolve().parents[1] / self.model_path,
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
