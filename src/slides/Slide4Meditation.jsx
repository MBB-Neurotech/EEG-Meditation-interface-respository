import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

function DustCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Dust motes — float upward with gentle horizontal drift and wobble
    const motes = Array.from({ length: 120 }, () => ({
      x:     Math.random(),
      y:     Math.random(),
      r:     Math.random() * 1.8 + 0.5,
      speed: Math.random() * 0.0006 + 0.0002,   // upward speed (y decreases)
      drift: (Math.random() - 0.5) * 0.00015,    // horizontal creep
      phase: Math.random() * Math.PI * 2,
      phv:   Math.random() * 0.012 + 0.006,      // wobble speed
      // warm pinkish-gold hues to match the photo's palette
      hue:   Math.random() < 0.5
               ? `255, ${180 + Math.floor(Math.random() * 60)}, ${200 + Math.floor(Math.random() * 55)}`  // pink/rose
               : `${230 + Math.floor(Math.random() * 25)}, ${200 + Math.floor(Math.random() * 40)}, 255`, // lavender
      op:    Math.random() * 0.32 + 0.06,
    }))

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      motes.forEach(m => {
        // Physics
        m.phase += m.phv
        m.y     -= m.speed
        m.x     += m.drift + Math.sin(m.phase) * 0.00025

        // Wrap around
        if (m.y < -0.04)  { m.y = 1.04; m.x = Math.random() }
        if (m.x < -0.02)    m.x = 1.02
        if (m.x >  1.02)    m.x = -0.02

        const cx = m.x * W
        const cy = m.y * H
        const rad = m.r * (window.devicePixelRatio || 1)

        // Soft glowing dot
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 4)
        g.addColorStop(0,   `rgba(${m.hue}, ${m.op})`)
        g.addColorStop(0.4, `rgba(${m.hue}, ${m.op * 0.45})`)
        g.addColorStop(1,   `rgba(${m.hue}, 0)`)

        ctx.beginPath()
        ctx.arc(cx, cy, rad * 4, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}

export default function Slide4Meditation() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">

      {/* Photo background — desaturated + brightened to match muted palette of other slides */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(/mountains.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'saturate(0.42) brightness(1.06)',
      }} />

      {/* Soft white wash to push it further toward the pastel range */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,245,255,0.12)' }} />

      <DustCanvas />

      <style>{`
        @keyframes glass-breathe {
          0%, 100% {
            box-shadow:
              0 4px 24px rgba(40,12,100,0.10),
              0 0 0 1px rgba(255,255,255,0.08),
              inset 0 1px 0 rgba(255,255,255,0.28),
              inset 0 -1px 0 rgba(255,255,255,0.06);
          }
          50% {
            box-shadow:
              0 8px 36px rgba(40,12,100,0.16),
              0 0 0 1px rgba(255,255,255,0.12),
              inset 0 1px 0 rgba(255,255,255,0.36),
              inset 0 -1px 0 rgba(255,255,255,0.08);
          }
        }
        .s4-btn {
          animation: glass-breathe 5s ease-in-out infinite;
          transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1);
        }
        .s4-btn:hover {
          transform: scale(1.06);
          animation-play-state: paused;
          box-shadow:
            0 10px 40px rgba(40,12,100,0.22),
            0 0 0 1px rgba(255,255,255,0.18),
            inset 0 1px 0 rgba(255,255,255,0.45),
            inset 0 -1px 0 rgba(255,255,255,0.10) !important;
        }
        .s4-ring { transition: background 0.22s ease, box-shadow 0.22s ease; }
        .s4-btn:hover .s4-ring {
          background: rgba(255,255,255,0.28);
          box-shadow: 0 6px 24px rgba(40,12,100,0.28), inset 0 1px 0 rgba(255,255,255,0.65);
        }
      `}</style>

      {/* Liquid glass button */}
      <Link to="/data" style={{ textDecoration: 'none', position: 'relative', zIndex: 10 }}>
        <div className="s4-btn" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '22px',
          padding: '56px 80px',
          borderRadius: '36px',
          background: 'rgba(255,255,255,0.02)',
          backdropFilter: 'blur(12px) saturate(140%) brightness(1.02)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%) brightness(1.02)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}>

          {/* Circular play icon */}
          <div className="s4-ring" style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.16)',
            border: '1.5px solid rgba(255,255,255,0.44)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(40,12,100,0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              style={{ marginLeft: 3 }}>
              <path d="M5.5 4.27L18.5 12L5.5 19.73V4.27Z"
                fill="rgba(255,255,255,0.94)"
                stroke="rgba(255,255,255,0.60)"
                strokeWidth="0.5"
                strokeLinejoin="round" />
            </svg>
          </div>

          <span style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: '26px',
            fontWeight: 300,
            letterSpacing: '0.14em',
            color: 'rgba(255,255,255,0.94)',
            textShadow: '0 2px 14px rgba(20,5,60,0.50)',
            textTransform: 'uppercase',
          }}>
            Start Session
          </span>
        </div>
      </Link>
    </div>
  )
}
