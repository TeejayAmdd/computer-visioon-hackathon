# Sightline FastAPI backend

The complete frontend/backend data flow is documented in the repository
[README.md](../README.md). This file contains backend-only setup and endpoint
details.

## Setup

From the repository root:

```powershell
c:\Users\Teejay\Desktop\frontend_react\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Start the API:

```powershell
c:\Users\Teejay\Desktop\frontend_react\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

The API is available at `http://localhost:8000`. OpenAPI documentation is at
`http://localhost:8000/docs`.

## Endpoints

- `GET /health` confirms the API is running and reports whether a YOLO model is loaded.
- `POST /detect` accepts an image as a `multipart/form-data` field named `file`.
- `WS /ws/detect` accepts a continuous stream of binary JPEG or PNG frames. Each
  frame receives a JSON response:

  ```json
  {
    "type": "detections",
    "detections": []
  }
  ```

  Send the next frame only after receiving the previous response. This keeps
  inference ordered and prevents an overloaded model queue. Text messages and
  invalid frames receive a JSON error response without closing the connection.

Each detection retains the original `zone` and `distance` fields and also
includes:

- `horizontal_position`: one of `far-left`, `left`, `center-left`, `center`,
  `center-right`, `right`, or `far-right`.
- `vertical_position`: `above`, `eye-level`, or `below`.
- `relative_depth`: a normalized bounding-box-size signal. This is relative
  depth, not a depth-camera measurement.
- `distance_meters` and `distance_confidence`: an approximate monocular
  pinhole-camera estimate for classes with a known typical height (for example,
  people, cars, and bicycles). It is `null` for unknown classes.
- `distance_method`: `monocular-height-prior` or
  `relative-bounding-box`, so clients do not mistake a heuristic for measured
  depth.
- `navigation_relevant` and `navigation_reason`: a conservative indicator for
  likely obstacles or navigation landmarks.

The metric estimate assumes a typical object height and an approximate focal
length derived from the image height. Camera field of view, object truncation,
perspective, and detector box quality can produce substantial error. Use a
calibrated stereo, LiDAR, or depth camera when reliable metric distances are
required.

The backend uses Ultralytics `yolo11n.pt` by default and downloads it into
`backend/models/` on first startup. Server deployments use
`opencv-python-headless` so the detector does not require Linux GUI libraries.
To use trained weights, set `MODEL_PATH` to the `.pt` file. If the configured
model cannot be loaded, the API remains available in fallback mode and reports
that mode through `/health`.

## Training a custom YOLO model

The repository includes a training utility that incorporates the notebook
workflow: it converts Pascal VOC image/XML annotations to YOLO labels, creates
train/validation splits and `data.yaml`, then trains Ultralytics YOLO.

From the repository root, provide the directory containing matching image and
Pascal VOC XML files:

```powershell
.\.venv\Scripts\python.exe backend\scripts\train_yolo.py `
  --dataset C:\path\to\your\dataset `
  --classes person car bicycle `
  --epochs 50
```

Training outputs are written to `backend\training\runs\custom\weights\best.pt`.
Start the API with those weights by setting `MODEL_PATH` to the generated file:

```powershell
$env:MODEL_PATH = "C:\Users\Teejay\Desktop\frontend_react\backend\training\runs\custom\weights\best.pt"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

The utility expects each image to have a same-named `.xml` file, for example
`images\frame-001.jpg` and `images\frame-001.xml`. Unknown XML classes are
ignored, so pass every class you want to train with `--classes`.

## Deployment configuration

Railway exposes the API on its assigned `PORT`. The repository contains a
`Dockerfile` and `railway.json` so the Linux runtime includes the libraries
required by OpenCV as well as the backend dependencies. The container starts
Uvicorn with `0.0.0.0:$PORT`, uses `/health` as the health check, and restarts
the service after a failed deployment.

In Netlify, set this build environment variable before deploying:

```text
VITE_API_URL=https://your-railway-service.up.railway.app
```

In Railway, set:

```text
ALLOWED_ORIGINS=https://your-site.netlify.app
```

Use the exact public URLs, with no trailing slash. Netlify environment
variables are embedded at build time, so redeploy Netlify after changing
`VITE_API_URL`. The Railway service must have a public domain enabled. The
frontend uses `wss://` automatically for an HTTPS Railway URL.
