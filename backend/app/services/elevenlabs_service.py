import httpx


class ElevenLabsError(RuntimeError):
    """Raised when ElevenLabs cannot fulfil a request."""


class ElevenLabsService:
    _base_url = "https://api.elevenlabs.io"

    def __init__(
        self,
        api_key: str | None,
        default_model_id: str,
        default_voice_id: str | None,
    ) -> None:
        self.api_key = api_key
        self.default_model_id = default_model_id
        self.default_voice_id = default_voice_id

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise ElevenLabsError(
                "ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the backend."
            )
        return {"xi-api-key": self.api_key}

    async def get_voices(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get(
                    f"{self._base_url}/v2/voices",
                    headers=self._headers(),
                )
            response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise ElevenLabsError("ElevenLabs voice request timed out.") from exc
        except httpx.HTTPStatusError as exc:
            raise ElevenLabsError(
                f"ElevenLabs voice request failed with HTTP {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise ElevenLabsError("ElevenLabs voice request failed.") from exc
        return response.json()

    async def text_to_speech(
        self,
        text: str,
        voice_id: str | None = None,
        model_id: str | None = None,
    ) -> bytes:
        selected_voice_id = voice_id or self.default_voice_id
        if not selected_voice_id:
            raise ElevenLabsError(
                "No ElevenLabs voice is configured. Select a voice or set "
                "ELEVENLABS_DEFAULT_VOICE_ID."
            )
        if not text.strip():
            raise ElevenLabsError("Speech text cannot be empty.")

        payload = {
            "text": text,
            "model_id": model_id or self.default_model_id,
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{self._base_url}/v1/text-to-speech/{selected_voice_id}",
                    headers={
                        **self._headers(),
                        "Accept": "audio/mpeg",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise ElevenLabsError("ElevenLabs speech request timed out.") from exc
        except httpx.HTTPStatusError as exc:
            raise ElevenLabsError(
                f"ElevenLabs speech request failed with HTTP {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise ElevenLabsError("ElevenLabs speech request failed.") from exc
        return response.content
