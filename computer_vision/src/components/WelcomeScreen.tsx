import { useEffect, useState } from 'react'
import './WelcomeScreen.css'

type WelcomeScreenProps = {
  onEnterApp: () => void
}

const navigation = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Accessibility', href: '#accessibility' },
  { label: 'Technology', href: '#technology' },
  { label: 'About', href: '#about' },
]

const demoDetections = [
  { label: 'Person', distance: '4.2 m', position: 'Ahead', confidence: '94%' },
  { label: 'Chair', distance: '2.8 m', position: 'Left', confidence: '88%' },
  { label: 'Door', distance: '6.1 m', position: 'Ahead', confidence: '91%' },
]

const steps = [
  {
    number: '01',
    title: 'Point',
    description: 'Choose the camera view you want Chreey to understand.',
    icon: '◉',
  },
  {
    number: '02',
    title: 'Detect',
    description: 'YOLO identifies visible objects in each analyzed frame.',
    icon: '⌗',
  },
  {
    number: '03',
    title: 'Understand',
    description: 'See an approximate distance and relative position when available.',
    icon: '↗',
  },
  {
    number: '04',
    title: 'Listen',
    description: 'Hear newly detected objects through voice announcements.',
    icon: '≋',
  },
]

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="12" r="8.25" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 1.75v3M22.25 12h-3M12 22.25v-3M1.75 12h3" />
      </svg>
    </span>
  )
}

function WelcomeScreen({ onEnterApp }: WelcomeScreenProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    const revealItems = document.querySelectorAll<HTMLElement>('.welcome-shell [data-reveal]')
    if (!('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.12 },
    )

    revealItems.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [])

  const closeMenu = () => setIsMenuOpen(false)

  return (
    <main className="welcome-shell">
      <nav className="welcome-nav" aria-label="Main navigation">
        <div className="welcome-nav-inner">
          <a className="brand" href="#home" aria-label="Chreey home" onClick={closeMenu}>
            <BrandMark />
            <span>Chreey</span>
          </a>
          <div className="welcome-nav-links">
            {navigation.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </div>
          <button className="nav-cta" type="button" onClick={onEnterApp}>
            Try Chreey <span aria-hidden="true">↗</span>
          </button>
          <button
            className={`mobile-menu-toggle ${isMenuOpen ? 'is-open' : ''}`}
            type="button"
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span /><span />
          </button>
        </div>
        {isMenuOpen && (
          <div className="mobile-navigation" id="mobile-navigation">
            {navigation.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>{item.label}</a>
            ))}
            <button type="button" onClick={() => { closeMenu(); onEnterApp() }}>
              Try Chreey <span aria-hidden="true">↗</span>
            </button>
          </div>
        )}
      </nav>

      <section className="welcome-hero" id="home">
        <div className="hero-copy" data-reveal>
          <p className="hero-kicker"><span className="hero-kicker-mark" /> AI-powered vision for a more accessible world</p>
          <h1>See the world<br />differently with <em>Chreey.</em></h1>
          <p className="hero-description">
            Chreey uses computer vision, spatial awareness, and voice feedback
            to help you understand the objects and environment around you.
          </p>
          <div className="hero-actions">
            <button className="hero-cta" type="button" onClick={onEnterApp}>
              Try Chreey <span aria-hidden="true">↗</span>
            </button>
            <a className="hero-secondary" href="#how-it-works">
              How it works <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="hero-disclaimer">
            You choose when to enable the camera. Frames are sent to the Chreey
            service configured for this app for detection.
          </p>
        </div>

        <div className="hero-visual" data-reveal aria-label="Illustration of Chreey's camera and object-awareness interface">
          <div className="hero-visual-orbit" aria-hidden="true" />
          <div className="hero-preview-card">
            <div className="hero-preview-header">
              <span><i className="mini-status-dot" /> CHREEY / VISION</span>
              <span>PRODUCT OVERVIEW</span>
            </div>
            <div className="hero-viewfinder">
              <span className="viewfinder-grid" />
              <span className="viewfinder-horizon" />
              <span className="hero-object-shape shape-person" />
              <span className="hero-object-shape shape-seat" />
              <span className="hero-box box-a" />
              <span className="hero-box box-b" />
              <span className="viewfinder-crosshair"><i /></span>
              <span className="viewfinder-scan" />
              <span className="viewfinder-caption">A new perspective on your surroundings</span>
            </div>
            <div className="hero-preview-footer">
              <span><i className="preview-footer-dot" /> Computer vision</span>
              <span>Objects · Distance · Position</span>
            </div>
          </div>
          <span className="hero-float-tag tag-vision">OBJECT AWARENESS</span>
          <span className="hero-float-tag tag-audio"><span className="tiny-wave"><i /><i /><i /></span> VOICE GUIDANCE</span>
          <p className="hero-visual-caption">An assistive view of what’s around you.</p>
        </div>
        <a className="hero-scroll-cue" href="#product">
          <span aria-hidden="true" /> Scroll to explore
        </a>
      </section>

      <section className="product-section section-wrap" id="product" aria-labelledby="product-title">
        <div className="section-heading product-heading" data-reveal>
          <p className="section-kicker">THE CHREEY EXPERIENCE</p>
          <h2 id="product-title">A camera view, with<br />more context.</h2>
          <p>Chreey brings detection results, spatial cues, and voice controls together in one focused workspace.</p>
        </div>

        <div className="product-window" data-reveal>
          <div className="product-window-bar">
            <div className="window-brand"><BrandMark /><span>Chreey</span></div>
            <span className="illustration-tag"><i /> ILLUSTRATIVE EXAMPLE · NOT LIVE DATA</span>
            <span className="window-menu-dots" aria-hidden="true">•••</span>
          </div>
          <div className="product-window-body">
            <div className="demo-camera">
              <div className="demo-camera-top">
                <span><i className="demo-live-dot" /> CAMERA VIEW</span>
                <span>ILLUSTRATION</span>
              </div>
              <div className="demo-scene">
                <span className="demo-scene-grid" />
                <span className="demo-scene-floor" />
                <span className="demo-person-shape" />
                <span className="demo-chair-shape" />
                <span className="demo-door-shape" />
                <span className="demo-detection-box person-box"><b>PERSON</b></span>
                <span className="demo-detection-box chair-box"><b>CHAIR</b></span>
                <span className="demo-detection-box door-box"><b>DOOR</b></span>
                <span className="demo-scan-line" />
                <span className="demo-frame-label">Conceptual interface only</span>
              </div>
              <div className="demo-camera-footer">
                <span><i className="demo-indicator" /> Example detection overlay</span>
                <span>Spatial details shown at right</span>
              </div>
            </div>
            <aside className="demo-results" aria-label="Illustrative detection results">
              <div className="demo-results-heading">
                <div>
                  <span className="demo-eyebrow">CURRENT FRAME</span>
                  <h3>What’s around</h3>
                </div>
                <span className="demo-count">03 <small>examples</small></span>
              </div>
              <ul>
                {demoDetections.map((item, index) => (
                  <li className="demo-detection" key={item.label} style={{ animationDelay: `${index * 120}ms` }}>
                    <span className={`demo-detection-index index-${index + 1}`}>0{index + 1}</span>
                    <div className="demo-detection-content">
                      <div className="demo-detection-title">
                        <strong>{item.label}</strong>
                        <span>{item.confidence}</span>
                      </div>
                      <p><span>{item.distance}</span><i />{item.position}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="demo-note">Sample labels and measurements are illustrative, not a live detector response.</p>
            </aside>
          </div>
          <div className="product-window-bottom">
            <span>Object recognition</span><i /><span>Approximate distance</span><i /><span>Relative position</span>
          </div>
        </div>
      </section>

      <section className="steps-section" id="how-it-works" aria-labelledby="steps-title">
        <div className="section-wrap steps-wrap">
          <div className="section-heading steps-heading" data-reveal>
            <p className="section-kicker">A SIMPLE FLOW</p>
            <h2 id="steps-title">From looking<br />to understanding.</h2>
          </div>
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number} data-reveal>
                <div className="step-card-top">
                  <span className="step-number">{step.number}</span>
                  <span className="step-icon" aria-hidden="true">{step.icon}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <span className="step-rule" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="accessibility-section section-wrap" id="accessibility" aria-labelledby="accessibility-title">
        <div className="accessibility-copy" data-reveal>
          <p className="section-kicker">ACCESSIBILITY, AT THE CORE</p>
          <h2 id="accessibility-title">Technology<br />designed to<br /><em>be heard.</em></h2>
          <p>
            Chreey pairs visual detection with spoken feedback, so you can hear
            useful context instead of needing to keep your attention on a screen.
          </p>
          <p className="accessibility-note">Announcements focus on newly detected objects to help avoid repetition as objects remain in view.</p>
          <button className="inline-link" type="button" onClick={onEnterApp}>
            Explore voice assistance <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="voice-demo" data-reveal aria-label="Illustrative voice announcement interface">
          <div className="voice-demo-header">
            <span>CHREEY / VOICE</span>
            <span className="voice-demo-label">ILLUSTRATIVE</span>
          </div>
          <div className="voice-demo-orbit" aria-hidden="true"><i /><i /><i /></div>
          <div className="voice-demo-center">
            <span className="voice-demo-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
            <span>VOICE GUIDANCE</span>
          </div>
          <div className="voice-demo-announcement">
            <div className="announcement-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
                <path d="M17 9a5 5 0 0 1 0 6m2-8a8 8 0 0 1 0 10" />
              </svg>
            </div>
            <div>
              <span>SAMPLE ANNOUNCEMENT</span>
              <strong>“Person ahead, approximately 4 metres away.”</strong>
            </div>
          </div>
          <div className="voice-demo-controls">
            <div className="voice-setting">
              <span className="voice-setting-icon" aria-hidden="true">Aa</span>
              <span><small>VOICE SELECTION</small><strong>Choose a Chreey voice</strong></span>
              <span className="voice-setting-arrow" aria-hidden="true">⌄</span>
            </div>
            <div className="voice-setting">
              <span className="voice-toggle-icon" aria-hidden="true"><i /></span>
              <span><small>NARRATION</small><strong>On or muted, your choice</strong></span>
              <span className="voice-setting-arrow" aria-hidden="true">↗</span>
            </div>
          </div>
          <p className="voice-demo-disclaimer">Illustrative announcement. Sample wording and distance only.</p>
        </div>
      </section>

      <section className="spatial-section" aria-labelledby="spatial-title">
        <div className="section-wrap spatial-wrap">
          <div className="spatial-copy" data-reveal>
            <p className="section-kicker">SPATIAL AWARENESS</p>
            <h2 id="spatial-title">Not just what.<br /><em>Where.</em></h2>
            <p>
              When a detection includes spatial estimates, Chreey adds context
              about its approximate distance and where it sits in the camera view.
            </p>
            <ul className="spatial-facts">
              <li><span>01</span><span>Approximate distance or relative near / mid / far</span></li>
              <li><span>02</span><span>Horizontal and vertical position in the frame</span></li>
              <li><span>03</span><span>Relative depth and navigation relevance where provided</span></li>
            </ul>
          </div>
          <div className="spatial-visual" data-reveal aria-label="Illustration of object direction and distance context">
            <div className="spatial-topline"><span>POSITION / CONCEPT</span><span>NOT LIVE DATA</span></div>
            <div className="spatial-map">
              <span className="spatial-axis axis-horizontal" />
              <span className="spatial-axis axis-vertical" />
              <span className="spatial-ring ring-outer" />
              <span className="spatial-ring ring-middle" />
              <span className="spatial-ring ring-inner" />
              <span className="spatial-center"><i /></span>
              <span className="spatial-object object-left"><i /><b>LEFT</b></span>
              <span className="spatial-object object-ahead"><i /><b>AHEAD</b></span>
              <span className="spatial-object object-right"><i /><b>RIGHT</b></span>
              <span className="spatial-distance distance-near">NEAR</span>
              <span className="spatial-distance distance-far">FAR</span>
            </div>
            <div className="spatial-sequence">
              <span>Object</span><i>↓</i><span>Distance</span><i>↓</i><span>Direction</span><i>↓</i><strong>Context</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="technology-section section-wrap" id="technology" aria-labelledby="technology-title">
        <div className="technology-heading" data-reveal>
          <div>
            <p className="section-kicker">THE TECHNOLOGY</p>
            <h2 id="technology-title">Built on practical<br />computer vision.</h2>
          </div>
          <p>Chreey combines a camera-based React interface with a FastAPI detection service and voice support.</p>
        </div>
        <div className="technology-grid">
          <article data-reveal>
            <span className="technology-index">01 / VISION</span>
            <span className="technology-icon" aria-hidden="true">⌗</span>
            <h3>YOLO object detection</h3>
            <p>Analyzes captured image frames and returns labels, confidence scores, and bounding boxes.</p>
          </article>
          <article data-reveal>
            <span className="technology-index">02 / SPATIAL</span>
            <span className="technology-icon" aria-hidden="true">⌖</span>
            <h3>Position &amp; distance estimates</h3>
            <p>The service enriches detections with relative position and approximate distance signals.</p>
          </article>
          <article data-reveal>
            <span className="technology-index">03 / SERVICE</span>
            <span className="technology-icon" aria-hidden="true">↔</span>
            <h3>React + FastAPI</h3>
            <p>A TypeScript frontend sends frames to the configured FastAPI endpoint for analysis.</p>
          </article>
          <article data-reveal>
            <span className="technology-index">04 / VOICE</span>
            <span className="technology-icon" aria-hidden="true">≋</span>
            <h3>ElevenLabs + browser speech</h3>
            <p>Voice announcements can use a selected ElevenLabs voice, with browser narration as fallback.</p>
          </article>
        </div>
        <p className="technology-caveat" data-reveal>
          Distance is an estimate, not a calibrated measurement. Results depend
          on object visibility, camera view, and model quality.
        </p>
      </section>

      <section className="about-section" id="about" aria-labelledby="about-title">
        <div className="section-wrap about-wrap">
          <div className="about-heading" data-reveal>
            <p className="section-kicker">WHY CHREEY</p>
            <h2 id="about-title">More useful context.<br />Less screen dependence.</h2>
          </div>
          <div className="about-content" data-reveal>
            <p>
              Chreey is designed to make camera-based object information easier
              to understand through clear visual results and voice feedback.
            </p>
            <div className="about-values">
              <span><i>01</i> Understand your surroundings</span>
              <span><i>02</i> Hear what is newly detected</span>
              <span><i>03</i> Choose when to use camera and narration</span>
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta section-wrap" aria-labelledby="final-cta-title">
        <div className="final-cta-content" data-reveal>
          <p className="section-kicker">A DIFFERENT WAY TO NOTICE</p>
          <h2 id="final-cta-title">Your surroundings<br />have more to say.</h2>
          <p>Experience a new way to understand the world around you.</p>
          <button className="hero-cta final-cta-button" type="button" onClick={onEnterApp}>
            Try Chreey <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="final-cta-mark" aria-hidden="true">
          <span className="cta-ring cta-ring-one" />
          <span className="cta-ring cta-ring-two" />
          <BrandMark />
        </div>
      </section>

      <footer className="welcome-footer section-wrap">
        <div className="footer-brand">
          <a className="brand" href="#home" aria-label="Chreey home">
            <BrandMark /><span>Chreey</span>
          </a>
          <p>Computer vision and voice context for a more accessible experience.</p>
        </div>
        <div className="footer-links">
          <div>
            <span>EXPLORE</span>
            <a href="#product">Product</a>
            <a href="#how-it-works">How it works</a>
            <a href="#accessibility">Accessibility</a>
          </div>
          <div>
            <span>LEARN</span>
            <a href="#technology">Technology</a>
            <a href="#about">About Chreey</a>
            <button type="button" onClick={onEnterApp}>Try Chreey</button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Chreey</span>
          <span>Approximate estimates. Clearer context.</span>
        </div>
      </footer>
    </main>
  )
}

export default WelcomeScreen
