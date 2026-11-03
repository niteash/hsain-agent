import json
import logging
import wave

from pathlib import Path
from typing import Any

import httpx

from app.config import (
    MODEL_API_BASE_URL,
    MODEL_API_KEY,
    META_MODELS,
    validate_config,
)

logger = logging.getLogger(__name__)

VOICE_MODEL = META_MODELS["voice"]

MAX_AUDIO_SIZE = 32 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 600

SUPPORTED_SAMPLE_RATES = {
    16000,
    24000,
}


def validate_audio_file(
    audio_path: str | Path,
) -> dict[str, Any]:

    path = Path(audio_path).resolve()

    if not path.is_file():
        raise FileNotFoundError(
            "Audio file does not exist."
        )

    file_size = path.stat().st_size

    if file_size <= 0:
        raise ValueError(
            "Audio file is empty."
        )

    if file_size > MAX_AUDIO_SIZE:
        raise ValueError(
            "Audio exceeds the 32 MB limit."
        )

    try:
        with wave.open(str(path), "rb") as audio:
            channels = audio.getnchannels()
            sample_width = audio.getsampwidth()
            sample_rate = audio.getframerate()
            frame_count = audio.getnframes()
            compression = audio.getcomptype()

    except (wave.Error, EOFError) as exc:
        raise ValueError(
            "Audio must be a valid WAV file."
        ) from exc

    if channels != 1:
        raise ValueError(
            "Audio must be mono."
        )

    if sample_width != 2:
        raise ValueError(
            "Audio must use 16-bit PCM."
        )

    if sample_rate not in SUPPORTED_SAMPLE_RATES:
        raise ValueError(
            "Audio sample rate must be 16000 or 24000 Hz."
        )

    if compression != "NONE":
        raise ValueError(
            "Compressed WAV audio is not supported."
        )

    duration = frame_count / sample_rate

    if duration <= 0:
        raise ValueError(
            "Audio duration is invalid."
        )

    if duration > MAX_AUDIO_DURATION_SECONDS:
        raise ValueError(
            "Audio cannot exceed 10 minutes."
        )

    return {
        "path": path,
        "file_size": file_size,
        "channels": channels,
        "sample_rate": sample_rate,
        "duration_seconds": round(duration, 2),
    }


def extract_transcript(
    response: Any,
) -> str | None:

    if isinstance(response, dict):
        candidates = [
            response.get("text"),
            response.get("transcript"),
        ]

        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()

        turns = response.get("turns")

        if isinstance(turns, list):
            transcripts = []

            for turn in turns:
                if not isinstance(turn, dict):
                    continue

                text = turn.get("text") or turn.get("transcript")

                if isinstance(text, str) and text.strip():
                    transcripts.append(text.strip())

            if transcripts:
                return "\n".join(transcripts)

    return None


def transcribe_audio(
    audio_path: str | Path,
    *,
    session_id: str | None = None,
) -> dict[str, Any]:

    validate_config()

    audio_info = validate_audio_file(audio_path)

    path = audio_info["path"]

    request_payload = {
        "model": VOICE_MODEL,
        "audioEncoding": "WAV",
        "mode": "PUSH_TO_TALK",
    }

    endpoint = (
        f"{MODEL_API_BASE_URL}/asr/transcribe"
    )

    headers = {
        "Authorization": f"Bearer {MODEL_API_KEY}",
        "Accept": "application/json",
    }

    params = {}

    if session_id:
        params["sessionId"] = session_id

    logger.info(
        "Starting Muse Voice transcription. Model=%s",
        VOICE_MODEL,
    )

    try:
        with path.open("rb") as audio_file:
            files = {
                "request": (
                    None,
                    json.dumps(request_payload),
                    "application/json",
                ),
                "audio": (
                    path.name,
                    audio_file,
                    "audio/wav",
                ),
            }

            with httpx.Client(
                timeout=180.0,
                follow_redirects=False,
            ) as client:

                response = client.post(
                    endpoint,
                    headers=headers,
                    params=params,
                    files=files,
                )

                response.raise_for_status()

                result = response.json()

    except httpx.HTTPStatusError as exc:
        logger.error(
            "Muse Voice API returned HTTP %s",
            exc.response.status_code,
        )

        raise RuntimeError(
            f"Muse Voice transcription failed "
            f"with HTTP {exc.response.status_code}."
        ) from exc

    except httpx.RequestError as exc:
        logger.exception(
            "Muse Voice connection failed."
        )

        raise RuntimeError(
            "Unable to connect to Muse Voice API."
        ) from exc

    transcript = extract_transcript(result)

    return {
        "status": "completed",
        "model": VOICE_MODEL,
        "transcript": transcript,
        "response": result,
        "audio": {
            "filename": path.name,
            "file_size": audio_info["file_size"],
            "duration_seconds": audio_info["duration_seconds"],
            "sample_rate": audio_info["sample_rate"],
        },
        "session_id": session_id,
    }