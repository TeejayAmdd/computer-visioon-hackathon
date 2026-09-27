import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { generateSpeech, getVoices, type Voice } from './services/tts'
import WelcomeScreen from './components/WelcomeScreen'

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
  distance_method: 'monocular-height-prior' | 'relative-bounding-box'
  relative_depth: number
  horizontal_position: HorizontalPosition
  vertical_position: VerticalPosition
  navigation_relevant: boolean
  navigation_reason: string
  box: { x1: number; y1: number; x2: number; y2: number }
}

type TrackedObject = {
  label: string
  box: Detection['box']
  missedFrames: number
}

const API_URL = (import.meta.env.VITE_API_URL?.trim() ?? (import.meta.env.DEV
  ? 'http://localhost:8000'
  : '')).replace(/\/+$/, '')


function formatDetection(detection: Detection) {
  const distance = detection.distance_meters
    ? `approximately ${detection.distance_meters} metres away`
    : `${detection.distance} distance (relative estimate)`
  const position = detection.horizontal_position === 'center' && detection.vertical_position === 'eye-level'
    ? 'directly ahead'
    : `${detection.vertical_position === 'eye-level' ? '' : `${detection.vertical_position} and `}${detection.horizontal_position}`
  return `${detection.label} ${distance}, ${position}.`
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pollingTimerRef = useRef<number | null>(null)
  const pollDetectionRef = useRef<(() => Promise<void>) | null>(null)
  const detectionRequestedRef = useRef(false)
  const activeObjectsRef = useRef<TrackedObject[]>([])
  const speechQueueRef = useRef<string | null>(null)
  const speechProcessingRef = useRef(false)
  const speechVersionRef = useRef(0)
  const speechAbortRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [detections, setDetections] = useState<Detection[]>([])
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [voices, setVoices] = useState<Voice[]>([])
  const [selectedVoiceId, setSelectedVoiceId] = useState(
    () => window.localStorage.getItem('chreey_voice_id') ?? '',
  )

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

  const fallbackSpeech = useCallback((message: string) => {
    if (!('speechSynthesis' in window)) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(message)
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }, [])

  const processSpeechQueue = useCallback(async () => {
    if (speechProcessingRef.current) return
    speechProcessingRef.current = true
    while (speechQueueRef.current) {
      const message = speechQueueRef.current
      speechQueueRef.current = null
      const version = speechVersionRef.current
      const abortController = new AbortController()
      speechAbortRef.current = abortController
      try {
        const blob = await generateSpeech(
          message,
          selectedVoiceId || undefined,
          undefined,
          abortController.signal,
        )
        if (version === speechVersionRef.current) {
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audioRef.current = audio
          try {
            await new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                abortController.signal.removeEventListener('abort', handleAbort)
              }
              const handleAbort = () => {
                audio.pause()
                cleanup()
                reject(new DOMException('Speech announcement was replaced.', 'AbortError'))
              }
              audio.onended = () => {
                cleanup()
                resolve()
              }
              audio.onerror = () => {
                cleanup()
                reject(new Error('Audio playback failed.'))
              }
              abortController.signal.addEventListener('abort', handleAbort, { once: true })
              void audio.play().catch(reject)
            })
          } finally {
            URL.revokeObjectURL(url)
            if (audioRef.current === audio) audioRef.current = null
          }
        }
      } catch {
        if (version === speechVersionRef.current) await fallbackSpeech(message)
      }
      if (speechAbortRef.current === abortController) speechAbortRef.current = null
    }
    speechProcessingRef.current = false
  }, [fallbackSpeech, selectedVoiceId])

  const enqueueSpeech = useCallback((message: string) => {
    speechVersionRef.current += 1
    speechQueueRef.current = message
    speechAbortRef.current?.abort()
    audioRef.current?.pause()
    audioRef.current = null
    window.speechSynthesis?.cancel()
    void processSpeechQueue()
  }, [processSpeechQueue])

  const narrate = useCallback(
    (nextDetections: Detection[]) => {
      const tracks = activeObjectsRef.current
      const matchedTrackIndexes = new Set<number>()
      const newDetections: Detection[] = []

      for (const detection of nextDetections) {
        const detectionCenterX = (detection.box.x1 + detection.box.x2) / 2
        const detectionCenterY = (detection.box.y1 + detection.box.y2) / 2
        let bestTrackIndex = -1
        let bestDistance = Number.POSITIVE_INFINITY

        tracks.forEach((track, index) => {
          if (matchedTrackIndexes.has(index) || track.label !== detection.label) return
          const trackCenterX = (track.box.x1 + track.box.x2) / 2
          const trackCenterY = (track.box.y1 + track.box.y2) / 2
          const distance = Math.hypot(
            detectionCenterX - trackCenterX,
            detectionCenterY - trackCenterY,
          )
          if (distance < bestDistance) {
            bestDistance = distance
            bestTrackIndex = index
          }
        })

        if (bestTrackIndex >= 0 && bestDistance <= 15) {
          tracks[bestTrackIndex] = {
            ...tracks[bestTrackIndex],
            box: detection.box,
            missedFrames: 0,
          }
          matchedTrackIndexes.add(bestTrackIndex)
        } else {
          newDetections.push(detection)
          tracks.push({ label: detection.label, box: detection.box, missedFrames: 0 })
          matchedTrackIndexes.add(tracks.length - 1)
        }
      }

      activeObjectsRef.current = tracks
        .map((track, index) => matchedTrackIndexes.has(index)
          ? track
          : { ...track, missedFrames: track.missedFrames + 1 })
        .filter((track) => track.missedFrames < 2)

      if (isMuted || newDetections.length === 0) return
      enqueueSpeech(newDetections.map(formatDetection).join(' '))
    },
    [enqueueSpeech, isMuted],
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
      pollingTimerRef.current = window.setTimeout(() => void pollDetectionRef.current?.(), 2500)
    }
  }, [captureFrame, narrate])
  useEffect(() => {
    pollDetectionRef.current = pollDetection
    return () => {
      pollDetectionRef.current = null
    }
  }, [pollDetection])

  useEffect(() => {
    const storedVoiceId = window.localStorage.getItem('chreey_voice_id') ?? ''
    void getVoices()
      .then((availableVoices) => {
        setVoices(availableVoices)
        if (!storedVoiceId && availableVoices.length > 0) {
          setSelectedVoiceId(availableVoices[0].voice_id)
        }
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : 'Unknown backend error.'
        setError(`Could not load ElevenLabs voices. ${detail} Browser narration remains available.`)
      })
  }, [])

  useEffect(() => {
    if (selectedVoiceId) window.localStorage.setItem('chreey_voice_id', selectedVoiceId)
  }, [selectedVoiceId])

  useEffect(() => () => {
    audioRef.current?.pause()
    activeObjectsRef.current = []
    speechQueueRef.current = null
    speechVersionRef.current += 1
    speechAbortRef.current?.abort()
    audioRef.current?.pause()
    audioRef.current = null
    window.speechSynthesis?.cancel()
  }, [])

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

  if (showWelcome) {
    return <WelcomeScreen onEnterApp={() => setShowWelcome(false)} />
  }

  return (
    <main className={`app-shell ${isDarkTheme ? 'theme-dark' : ''}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Chreey home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="12" r="8.25" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 1.75v3M22.25 12h-3M12 22.25v-3M1.75 12h3" />
            </svg>
          </span>
          <span>Chreey</span>
        </a>
        <div className="topbar-actions">
          <a className="text-button overview-button" href="/">
            Overview
          </a>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setIsDarkTheme((darkTheme) => !darkTheme)}
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <span aria-hidden="true">{isDarkTheme ? '◐' : '◑'}</span>
            {isDarkTheme ? 'Light' : 'Dark'}
          </button>
          <button
            className={`sound-toggle ${isMuted ? 'is-muted' : ''}`}
            type="button"
            onClick={() => setIsMuted((muted) => !muted)}
            aria-label={isMuted ? 'Unmute narration' : 'Mute narration'}
          >
            <span className="sound-indicator" aria-hidden="true" />
            {isMuted ? 'Voice off' : 'Voice on'}
          </button>
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">CHREEY / ASSISTIVE VISION</p>
          <h1>Understand your surroundings.</h1>
          <p className="intro-copy">
            Start a camera analysis to see detected objects, approximate distance,
            relative position, and spoken guidance.
          </p>
        </div>
        <div className="intro-note">
          <span className="note-icon" aria-hidden="true"><span /></span>
          <span>Camera frames are analyzed by your configured Chreey service.</span>
        </div>
      </section>

      <section className="workspace" aria-label="Camera and detection workspace">
        <div className="camera-card">
          <div className="camera-toolbar">
            <div className="camera-heading">
              <p className="section-label">01 / CAMERA VIEW</p>
              <h2>Live scene</h2>
            </div>
            <div className="camera-actions">
              <span className={`status-pill ${isDetecting ? 'is-live' : isCameraOn ? 'is-ready' : ''}`}>
                <i aria-hidden="true" />
                {isDetecting ? 'Analyzing' : isCameraOn ? 'Camera ready' : 'Camera off'}
              </span>
              <button className="text-button camera-permission" type="button" onClick={isCameraOn ? stopCamera : startCamera}>
                {isCameraOn ? 'Turn off camera' : 'Allow camera'}
              </button>
            </div>
          </div>
          <div className={`camera-stage ${isDetecting ? 'is-analyzing' : ''}`}>
            <video ref={videoRef} muted playsInline aria-label="Live camera preview" />
            {!isCameraOn && (
              <div className="camera-placeholder">
                <span className="camera-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" focusable="false">
                    <rect x="7" y="13" width="34" height="24" rx="4" />
                    <circle cx="24" cy="25" r="7" />
                    <path d="M16 13l2.5-4h11l2.5 4" />
                  </svg>
                </span>
                <strong>Camera preview</strong>
                <span>Allow camera access to see the current view.</span>
              </div>
            )}
            {isDetecting && <div className="scan-line" aria-hidden="true" />}
            {isCameraOn && detections.map((detection) => (
              <div
                className="detection-box"
                key={`${detection.label}-${detection.box.x1}`}
                style={{
                  left: `${detection.box.x1}%`,
                  top: `${detection.box.y1}%`,
                  width: `${detection.box.x2 - detection.box.x1}%`,
                  height: `${detection.box.y2 - detection.box.y1}%`,
                }}
              >
                <span>
                  <strong>{detection.label}</strong>
                  <small>{Math.round(detection.confidence * 100)}%</small>
                </span>
              </div>
            ))}
            <canvas ref={canvasRef} className="hidden-canvas" />
            <span className="frame-corner frame-corner-top" aria-hidden="true" />
            <span className="frame-corner frame-corner-bottom" aria-hidden="true" />
          </div>
          <div className="camera-controls">
            <div className="detection-control">
              <button className={`primary-button ${isDetecting ? 'is-active' : ''}`} type="button" onClick={() => void toggleDetection()}>
                <span className="control-indicator" aria-hidden="true">{isDetecting ? '■' : '▶'}</span>
                {isDetecting ? 'Stop detection' : 'Start detection'}
              </button>
              <p className="control-hint">
                {isDetecting
                  ? 'Camera frames are being checked every 2.5 seconds.'
                  : isCameraOn
                    ? 'Start detection when you are ready.'
                    : 'Allow camera access to begin.'}
              </p>
            </div>
            <div className="voice-controls">
              <div className="voice-select-wrap">
                <label htmlFor="voice-select">Chreey voice</label>
                <select
                  id="voice-select"
                  value={selectedVoiceId}
                  onChange={(event) => setSelectedVoiceId(event.target.value)}
                  disabled={voices.length === 0}
                >
                  <option value="">Browser fallback</option>
                  {voices.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>)}
                </select>
              </div>
              <button className="secondary-button" type="button" onClick={() => enqueueSpeech('Hello. I am Chreey. This is a test of the selected voice.')}>
                Test voice
              </button>
            </div>
          </div>
        </div>

        <aside className="detections-card">
          <div className="card-heading">
            <div>
              <p className="section-label">02 / DETECTION RESULTS</p>
              <h2>Current frame</h2>
            </div>
            <span className="frame-count">{detections.length.toString().padStart(2, '0')} <small>objects</small></span>
          </div>
          <p className="frame-updated">
            {lastUpdated
              ? `Last analyzed ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : isDetecting ? 'Waiting for the first detector response' : 'Results appear after a frame is analyzed'}
          </p>
          {detections.length > 0 ? (
            <ul className="detection-list">
              {detections.map((detection) => (
                <li className="detection-item" key={`${detection.label}-${detection.box.x1}`}>
                  <div className="detection-item-heading">
                    <div className="object-name">
                      <span className={`object-marker ${detection.zone}`} aria-hidden="true" />
                      <h3>{detection.label}</h3>
                    </div>
                    <span className="confidence">
                      <strong>{Math.round(detection.confidence * 100)}%</strong>
                      <small>confidence</small>
                    </span>
                  </div>
                  <div className="detection-facts">
                    <div className="detection-fact">
                      <span>Distance</span>
                      <strong>{detection.distance_meters !== null ? `~${detection.distance_meters} m` : detection.distance}</strong>
                      <small>
                        {detection.distance_meters !== null
                          ? `Approximate · ${Math.round(detection.distance_confidence * 100)}% estimate confidence`
                          : 'Relative near-to-far estimate'}
                      </small>
                    </div>
                    <div className="detection-fact">
                      <span>Position</span>
                      <strong>{detection.horizontal_position}</strong>
                      <small>{detection.vertical_position} · {detection.zone} zone</small>
                    </div>
                  </div>
                  {detection.navigation_relevant && (
                    <p className="navigation-note">
                      <span aria-hidden="true" />
                      {detection.navigation_reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-state-mark" aria-hidden="true"><i /><i /><i /></span>
              <strong>{isDetecting ? 'Scanning the current view' : 'Nothing analyzed yet'}</strong>
              <p>
                {isDetecting
                  ? 'Detection results will appear here when the first frame is processed.'
                  : 'Start detection to see objects, distance estimates, and relative positions.'}
              </p>
            </div>
          )}
          <div className="legend">
            <span className="legend-title">Relative range</span>
            <span><i className="legend-dot near" />Near</span>
            <span><i className="legend-dot mid" />Mid</span>
            <span><i className="legend-dot far" />Far</span>
          </div>
        </aside>
      </section>

      <section className="voice-banner" aria-live="polite">
        <span className={`voice-wave ${isMuted ? 'is-muted' : ''}`} aria-hidden="true">
          <i /><i /><i /><i />
        </span>
        <div className="voice-banner-copy">
          <p className="section-label">VOICE ASSISTANCE</p>
          <strong>
            {isMuted
              ? 'Narration is muted'
              : detections.length
                ? formatDetection(detections[0])
                : 'Voice narration is ready'}
          </strong>
          <span>
            {isMuted
              ? 'Turn voice back on to hear newly detected objects.'
              : `Announcements use ${voices.find((voice) => voice.voice_id === selectedVoiceId)?.name ?? 'the browser fallback voice'} and avoid repeating tracked objects.`}
          </span>
        </div>
        <button className="secondary-button voice-action" type="button" onClick={() => setIsMuted((muted) => !muted)}>
          {isMuted ? 'Turn voice on' : 'Mute voice'}
        </button>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}
      <footer className="app-footer">
        <span>CHREEY / ASSISTIVE VISION</span>
        <span>Camera frames are sent to the configured detector service.</span>
      </footer>
    </main>
  )
}

export default App
