# Sightline Accessibility Assistant

Sightline is a computer-vision accessibility assistant for blind and low-vision
users. It uses a camera to capture the user's surroundings, a FastAPI service to
run object detection, and a React interface to show and speak the results.

The system is designed around a simple loop:

```text
Camera
  │
  ▼
React frontend captures an image frame
  │  JPEG/PNG bytes
  ▼
FastAPI backend
  │  decoded RGB image
  ▼
YOLO model
  │  classes, confidence scores, bounding boxes
  ▼
FastAPI adds zone and distance information
  │  JSON detections
  ▼
React renders boxes, object details, and spoken narration
```

## Current implementation status

| Area | Status |
| --- | --- |
| React camera permission and preview | Implemented |
| React WebSocket frame streaming | Implemented |
| FastAPI `GET /health` | Implemented |
| FastAPI `POST /detect` | Implemented |
| FastAPI `WS /ws/detect` | Implemented and tested independently |
| React WebSocket integration | Implemented |
| Ultralytics YOLO detection | Implemented with `yolo11n.pt` |

The backend loads the configured Ultralytics model from
`backend/models/teammate_model/best.pt` by default. The original base weights are
kept at `backend/models/base/yolo11n.pt`. You can switch models without changing
Python code by setting `YOLO_MODEL_PATH` to another path relative to
`backend/`, such as `models/base/yolo11n.pt`.

## Repository structure

```text
frontend_react/
├── computer_vision/              # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx               # Camera UI, frame capture, narration
│   │   ├── App.css
│   │   └── index.css
│   └── package.json
├── backend/                      # FastAPI backend
│   ├── app/
│   │   ├── main.py               # HTTP and WebSocket routes
│   │   ├── config.py             # Environment-backed settings
│   │   ├── schemas/
│   │   │   └── detection.py      # Pydantic response models
│   │   └── services/
│   │       └── detector.py       # Image validation and YOLO inference
│   ├── models/
│   │   ├── base/
│   │   │   └── yolo11n.pt
│   │   └── teammate_model/
│   │       └── best.pt
│   ├── requirements.txt
│   └── .env.example
└── README.md
```

## How the frontend works

The React app:

1. Requests camera access with `navigator.mediaDevices.getUserMedia()`.
2. Displays the live `MediaStream` in a `<video>` element.
3. Copies the current video frame into a hidden `<canvas>`.
4. Encodes the canvas as a JPEG blob.
5. Sends that image to the backend.
6. Receives a detection response.
7. Updates the detection list and bounding-box overlay.
8. Uses the browser Web Speech API to narrate new detections.

The current React implementation sends one HTTP request every 2.5 seconds while
analysis is active. It currently uses:

```text
POST http://localhost:8000/detect
Content-Type: multipart/form-data
field: file
```

Example frontend request:

```javascript
const blob = await new Promise((resolve) =>
  canvas.toBlob(resolve, "image/jpeg", 0.8)
);

const formData = new FormData();
formData.append("file", blob, "camera-frame.jpg");

const response = await fetch("http://localhost:8000/detect", {
  method: "POST",
  body: formData,
});

const result = await response.json();
```

The frontend does not send raw video files or a video stream in one request. It
sends individual image frames. This keeps each inference request independent.

## How the backend works

FastAPI exposes the API and owns the model lifecycle:

1. The application starts and calls `detector.load()`.
2. The configured Ultralytics `.pt` model is loaded once. The default is
   `backend/models/yolo11n.pt`.
3. A request supplies one JPEG or PNG frame.
4. The detector validates and decodes the bytes with Pillow.
5. The decoded RGB image is passed to YOLO.
6. YOLO returns class IDs, class names, confidence scores, and box coordinates.
7. The backend calculates a horizontal zone and approximate distance.
8. FastAPI serializes the enriched detections as JSON.

The backend does not send a frame to the model over HTTP. The backend receives
the frame, decodes it locally, and calls the loaded Python YOLO object directly.

### Model input

```text
Pillow RGB image
```

### Raw model information

YOLO provides:

- Class ID and class name
- Confidence score from `0.0` to `1.0`
- Bounding box: `x1`, `y1`, `x2`, `y2`

### Backend-enriched information

The backend adds:

- `zone`: `left`, `center`, or `right`
- `distance`: `near`, `mid`, or `far`

Zone is calculated from the horizontal center of the box:

```text
left       center       right
0% ─────── 33% ─────── 66% ─────── 100%
```

Distance is a visual heuristic based on the bounding-box area relative to the
image area:

```text
area >= 25%  → near
area >= 8%   → mid
otherwise    → far
```

These values are approximate. They are not physical measurements.

## HTTP API

### `GET /health`

Confirms that the service is running and reports model status.

```json
{
  "status": "ok",
  "model_loaded": false,
  "detector_mode": "fallback"
}
```

When the model is available, the values become:

```json
{
  "status": "ok",
  "model_loaded": true,
  "detector_mode": "yolo"
}
```

### `POST /detect`

Accepts an image as a multipart field named `file`.

```text
POST /detect
Content-Type: multipart/form-data
```

Response:

```json
{
  "detections": [
    {
      "label": "person",
      "confidence": 0.94,
      "zone": "center",
      "distance": "near",
      "box": {
        "x1": 120,
        "y1": 80,
        "x2": 420,
        "y2": 600
      }
    }
  ]
}
```

Bounding-box coordinates are returned as percentages from `0` to `100`, allowing
the React overlay to align with the displayed video at any size.

## Continuous WebSocket detection

For continuous video, the backend supports:

```text
ws://localhost:8000/ws/detect
```

The client opens one connection and sends each camera frame as binary JPEG or
PNG data:

```javascript
const socket = new WebSocket("ws://localhost:8000/ws/detect");

socket.onopen = () => socket.send(jpegBlob);

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "detections") {
    renderDetections(message.detections);
  }
};
```

The recommended flow is request-response:

```text
send frame 1
  ↓
receive detections for frame 1
  ↓
send frame 2
  ↓
receive detections for frame 2
  ↓
repeat while the camera is live
```

The backend processes frames in order. It runs synchronous model inference in a
thread pool so the FastAPI event loop can continue handling the WebSocket. A
model lock prevents simultaneous calls from corrupting or overloading one YOLO
instance.

Successful WebSocket response:

```json
{
  "type": "detections",
  "detections": []
}
```

WebSocket error response:

```json
{
  "type": "error",
  "detail": "Send each video frame as binary JPEG or PNG data."
}
```

Text messages are not treated as image frames. Invalid or empty frames receive
an error response without automatically closing the connection.

The React app opens this WebSocket when the user starts recording. It captures
one JPEG frame from the camera, waits for YOLO's response, renders the returned
objects and boxes, narrates detections with browser speech synthesis, and then
sends the next frame.

## Setup

### Backend

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

Backend URLs:

```text
API:  http://localhost:8000
Docs: http://localhost:8000/docs
Health: http://localhost:8000/health
WS: ws://localhost:8000/ws/detect
```

### Frontend

```powershell
cd computer_vision
npm install
npm run dev
```

The frontend normally runs at:

```text
http://localhost:5173
```

### Railway backend

Railway builds the root `Dockerfile` and uses the start command in
`railway.json`:

```text
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT
```

Configure these Railway service variables:

```env
YOLO_MODEL_PATH=models/teammate_model/best.pt
CONFIDENCE_THRESHOLD=0.35
ALLOWED_ORIGINS=https://your-site.netlify.app
```

Railway supplies `PORT`; do not replace `$PORT` with a fixed production port.
The Docker image copies `backend/`, so the configured relative model path is
resolved inside the deployed backend directory.

### Backend environment variables

Copy `backend\.env.example` to a local environment configuration if needed:

```env
MODEL_PATH=models/yolo11n.pt
CONFIDENCE_THRESHOLD=0.35
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ELEVENLABS_API_KEY=
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
ELEVENLABS_DEFAULT_VOICE_ID=
```

Install the YOLO dependency:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Extract the teammates' ZIP into `backend\models\teammate_model\`. If the ZIP
contains nested training output, locate the trained `.pt` file (normally
`best.pt`) and place or copy that file at
`backend\models\teammate_model\best.pt`. The active model is configured with:

```env
YOLO_MODEL_PATH=models/teammate_model/best.pt
```

The path is resolved relative to `backend/` and works on Windows and Railway's
Linux environment. Class names come from the loaded YOLO model at inference
time; no frontend class list needs to be updated for newly trained classes.

For local development, run the backend with:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000 --env-file backend\.env
```

To use the base model instead, set:

```env
YOLO_MODEL_PATH=models/base/yolo11n.pt
```

## ElevenLabs text-to-speech

The existing detection pipeline remains responsible for deciding what to say.
The frontend sends announcement text to the FastAPI backend, and only the
backend calls ElevenLabs. The API key is never sent to the browser.

The backend exposes:

```text
GET  /api/tts/voices
POST /api/tts/speak
```

The React app loads voices from the backend, stores only the selected voice ID
in `localStorage` under `chreey_voice_id`, and queues announcements so audio
does not overlap. If ElevenLabs or audio playback fails, browser speech
synthesis is used as a fallback.

Set the backend variables in `backend\.env` locally or in Railway. Set only
`VITE_API_URL` in the frontend environment:

```env
VITE_API_URL=http://127.0.0.1:8000
```

For Netlify, use the public Railway backend URL instead. Never create a
`VITE_ELEVENLABS_API_KEY` variable.

## Testing the backend

Health check:

```powershell
curl.exe http://127.0.0.1:8000/health
```

HTTP image detection:

```powershell
curl.exe -X POST `
  -F "file=@frame.jpg;type=image/jpeg" `
  http://127.0.0.1:8000/detect
```

The WebSocket endpoint can be tested with any WebSocket client that sends binary
image bytes and waits for one JSON response per frame.

## Privacy and limitations

- Camera access is requested by the browser and can be stopped by the user.
- Frames are sent to the local FastAPI service during development.
- The backend does not persist uploaded frames.
- Zone and distance are estimates, not exact spatial measurements.
- Results depend on lighting, camera quality, object visibility, model quality,
  and the training dataset.

## Development roadmap

1. Add and validate the trained YOLO model.
2. Connect React to `WS /ws/detect`.
3. Scale pixel bounding boxes correctly over the displayed video.
4. Add WebSocket reconnect and backpressure handling.
5. Add narration cooldown and deduplication for continuous results.
6. Test with different lighting, camera angles, and multiple objects.
