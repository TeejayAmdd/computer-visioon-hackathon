import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

type Zone = 'left' | 'center' | 'right'
type Distance = 'near' | 'mid' | 'far'
type HorizontalPosition = 'far-left' | 'left' | 'center-left' | 'center' | 'center-right' | 'right' | 'far-right'
type VerticalPosition = 'above' | 'eye-level' | 'below'

type Detection = {
  label: string
  confidence: number
  zone: Zone
  distance: Distance
  distance_meters: number | null
  distance_confidence: number
  horizontal_position: HorizontalPosition
  vertical_position: VerticalPosition
  navigation_relevant: boolean
  box: { x1: number; y1: number; x2: number; y2: number }
}

const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV
  ? 'http://localhost:8000'
  : 'https://computervision-production.up.railway.app')).replace(/\/+$/, '')


function formatDetection(detection: Detection) {
  const distance = detection.distance_meters
    ? `approximately ${detection.distance_meters} metres away`
    : `${detection.distance} distance (relative estimate)`
  const position = detection.horizontal_position === 'center' && detection.vertical_position === 'eye-level'
    ? 'directly ahead'
    : `${detection.vertical_position === 'eye-level' ? '' : `${detection.vertical_position} and `}${detection.horizontal_position}`
  return `${detection.label} ${distance}, ${position}${detection.navigation_relevant ? ', potentially relevant for navigation' : ''}.`
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pollingTimerRef = useRef<number | null>(null)
  const detectionRequestedRef = useRef(false)
  const lastNarrationRef = useRef('')
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [detections, setDetections] = useState<Detection[]>([])
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = isDarkTheme ? 'dark' : 'light'
    return () => {
      delete document.documentElement.dataset.theme
    }
  }, [isDarkTheme])

  const stopCamera = useCallback(() => {
    detectionRequestedRef.current = false
    if (pollingTimerRef.current !== null) {
      window.clearTimeout(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsCameraOn(false)
    setIsDetecting(false)
  }, [])

  const narrate = useCallback(
    (nextDetections: Detection[]) => {
      if (isMuted || !('speechSynthesis' in window) || nextDetections.length === 0) return
      const message = nextDetections.map(formatDetection).join(' ')
      if (message === lastNarrationRef.current) return
      lastNarrationRef.current = message
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(message))
    },
    [isMuted],
  )

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (
      !video ||
      !canvas ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) return null

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)

    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  }, [])

  const pollDetection = useCallback(async () => {
    if (!detectionRequestedRef.current) return

    try {
      const blob = await captureFrame()
      if (!blob) {
        setError('Could not capture a camera frame for the detector.')
      } else {
        const formData = new FormData()
        formData.append('file', blob, 'camera-frame.jpg')
        const response = await fetch(`${API_URL}/detect`, {
          method: 'POST',
          body: formData,
        })
        if (!response.ok) {
          const detail = await response.text()
          throw new Error(detail || `HTTP ${response.status}`)
        }
        const result = await response.json() as { detections?: Detection[] }
        const nextDetections = result.detections ?? []
        setDetections(nextDetections)
        setLastUpdated(new Date())
        narrate(nextDetections)
        setError('')
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown detector error'
      setError(`The detector request failed: ${detail}`)
      detectionRequestedRef.current = false
      setIsDetecting(false)
      return
    }

    if (detectionRequestedRef.current) {
      pollingTimerRef.current = window.setTimeout(() => void pollDetection(), 2500)
    }
  }, [captureFrame, narrate])

  const startCamera = async (): Promise<boolean> => {
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsCameraOn(true)
      return true
    } catch {
      setError('Camera access was blocked. Allow camera permission in your browser and try again.')
      return false
    }
  }

  const toggleDetection = async () => {
    if (isDetecting) {
      detectionRequestedRef.current = false
      if (pollingTimerRef.current !== null) {
        window.clearTimeout(pollingTimerRef.current)
        pollingTimerRef.current = null
      }
      setIsDetecting(false)
      return
    }

    if (!isCameraOn && !(await startCamera())) return

    if (!API_URL) {
      setError('The production API is not configured. Set VITE_API_URL in Netlify and redeploy.')
      return
    }

    setError('')
    detectionRequestedRef.current = true
    setIsDetecting(true)
    void pollDetection()
  }

  useEffect(() => () => stopCamera(), [stopCamera])

  return (
    <main className={`app-shell ${isDarkTheme ? 'theme-dark' : ''}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Sightline home">
          <span className="brand-mark" aria-hidden="true">◉</span>
          <span>Cheery_eye</span>
        </a>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setIsDarkTheme((darkTheme) => !darkTheme)}
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <span aria-hidden="true">{isDarkTheme ? '☀' : '☾'}</span>
            {isDarkTheme ? 'Light' : 'Dark'}
          </button>
          <button className="icon-button" type="button" onClick={() => setIsMuted((muted) => !muted)} aria-label={isMuted ? 'Unmute narration' : 'Mute narration'}>
            {isMuted ? '◌' : '◉'}
          </button>
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">AI accessibility assistant</p>
          <h1>Understand your surroundings.</h1>
          <p className="intro-copy">Point your camera ahead. Sightline identifies what is around you and describes it in real time.</p>
        </div>
        <div className="intro-note">
          <span className="note-icon" aria-hidden="true">✦</span>
          <span>Designed for clearer, safer movement.</span>
        </div>
      </section>

      <section className="workspace" aria-label="Camera and detection workspace">
        <div className="camera-card">
          <div className="camera-toolbar">
            <div>
              <p className="section-label">Camera view</p>
              <p className="muted-text">{isCameraOn ? 'Camera connected' : 'Camera is off'}</p>
            </div>
            <button className="text-button" type="button" onClick={isCameraOn ? stopCamera : startCamera}>
              {isCameraOn ? 'Turn off' : 'Allow camera'}
            </button>
          </div>
          <div className="camera-stage">
            <video ref={videoRef} muted playsInline aria-label="Live camera preview" />
            {!isCameraOn && (
              <div className="camera-placeholder">
                <span className="camera-icon" aria-hidden="true">⌾</span>
                <strong>Your camera view will appear here</strong>
                <span>Camera access stays on your device.</span>
              </div>
            )}
            <div className="scan-line" aria-hidden="true" />
            {isCameraOn && detections.map((detection) => (
              <div
                className="detection-box"
                key={`${detection.label}-${detection.box.x1}`}
                style={{ left: `${detection.box.x1}%`, top: `${detection.box.y1}%`, width: `${detection.box.x2 - detection.box.x1}%`, height: `${detection.box.y2 - detection.box.y1}%` }}
              >
                <span>{detection.label}</span>
              </div>
            ))}
            <canvas ref={canvasRef} className="hidden-canvas" />
          </div>
          <div className="camera-controls">
            <button className={`primary-button ${isDetecting ? 'is-active' : ''}`} type="button" onClick={() => void toggleDetection()}>
              <span aria-hidden="true">{isDetecting ? '■' : '▶'}</span>
              {isDetecting ? 'Stop recording' : 'Start recording'}
            </button>
            <p className="control-hint">{isDetecting ? 'Streaming camera frames to YOLO' : 'Start recording when you are ready'}</p>
          </div>
        </div>

        <aside className="detections-card">
          <div className="card-heading">
            <div>
              <p className="section-label">What I see</p>
              <h2>{detections.length ? `${detections.length} objects nearby` : 'No objects yet'}</h2>
            </div>
            <span className="live-label">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting'}</span>
          </div>
          {detections.length > 0 ? (
            <ul className="detection-list">
              {detections.map((detection) => (
                <li className="detection-item" key={`${detection.label}-${detection.box.x1}`}>
                  <span className={`object-icon ${detection.zone}`} aria-hidden="true">●</span>
                  <span className="object-details"><strong>{detection.label}</strong><span>{detection.distance_meters ? `~${detection.distance_meters} m` : detection.distance} · {detection.horizontal_position} · {detection.vertical_position}</span></span>
                  <span className="confidence">{Math.round(detection.confidence * 100)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <span aria-hidden="true">⌁</span>
              <p>Start your camera and analysis to see detected objects, distance, and position.</p>
            </div>
          )}
          <div className="legend">
            <span><i className="legend-dot near" />Near</span>
            <span><i className="legend-dot mid" />Mid</span>
            <span><i className="legend-dot far" />Far</span>
          </div>
        </aside>
      </section>

      <section className="voice-banner" aria-live="polite">
        <span className="voice-wave" aria-hidden="true">)))</span>
        <div><strong>{isMuted ? 'Narration is muted' : detections.length ? formatDetection(detections[0]) : 'Voice narration is ready'}</strong><span>{isMuted ? 'Use the sound button above to turn it back on.' : 'Important detections will be spoken automatically.'}</span></div>
        <button className="text-button" type="button" onClick={() => setIsMuted((muted) => !muted)}>{isMuted ? 'Turn on voice' : 'Mute voice'}</button>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}
      <footer><span>Built for more independent movement.</span><span>Accessibility first · Your camera stays private</span></footer>
    </main>
  )
}

export default App
