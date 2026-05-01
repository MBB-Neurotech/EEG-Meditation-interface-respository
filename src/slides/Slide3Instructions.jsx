import { useEffect, useRef } from 'react'

function OceanCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame
    let t = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const bubbles = Array.from({ length: 55 }, () => ({
      x: Math.random(),
      y: 0.7 + Math.random() * 0.4,
      r: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 0.0015 + 0.0008,
      drift: (Math.random() - 0.5) * 0.0006,
      opacity: Math.random() * 0.4 + 0.08,
      phase: Math.random() * Math.PI * 2,
    }))

    const waves = Array.from({ length: 8 }, (_, i) => ({
      y: 0.55 + i * 0.065,
      speed: 0.3 + i * 0.08,
      amplitude: 0.012 + i * 0.003,
      opacity: 0.06 - i * 0.005,
      phase: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      t += 0.008
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      waves.forEach(w => {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(200, 230, 255, ${w.opacity})`
        ctx.lineWidth = 1

        for (let x = 0; x <= W; x += 4) {
          const fx = x / W
          const y = (w.y + Math.sin(fx * 8 + t * w.speed + w.phase) * w.amplitude) * H
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()

        w.y -= 0.00025
        if (w.y < -0.05) w.y = 1.05
      })

      bubbles.forEach(b => {
        const wobble = Math.sin(t * 2 + b.phase) * 0.008
        const cx = (b.x + wobble) * W
        const cy = b.y * H
        const fade = Math.min(1, (0.7 - b.y) / 0.2)

        ctx.beginPath()
        ctx.arc(cx, cy, b.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200, 230, 255, ${b.opacity * Math.max(0, fade)})`
        ctx.fill()

        b.y -= b.speed
        b.x += b.drift
        if (b.y < 0.45 || b.x < 0 || b.x > 1) {
          b.y = 0.85 + Math.random() * 0.2
          b.x = Math.random()
        }
      })

      animFrame = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animFrame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
}

const ITEMS = [
  {
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,0.18)',
    border: 'rgba(59,130,246,0.22)',
    icon: (
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    title: 'Understanding the EEG',
    body: 'The system detects patterns typically associated with focused meditation. If your attention drifts, it may impact beta and alpha wave feedback.',
  },
  {
    color: '#10b981',
    bgColor: 'rgba(16,185,129,0.18)',
    border: 'rgba(16,185,129,0.22)',
    icon: (
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    title: 'Live Monitoring',
    body: "Moderators will observe feedback during your meditation. Afterwards, we'll share the readings with you to review together.",
  },
  {
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.2)',
    icon: (
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    title: 'Most Important',
    body: "You don't need to try to control any EEG readings. Just meditate naturally and be present.",
    highlight: true,
  },
]

export default function Slide3Instructions() {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {/* Photo background */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(/IMG_1202.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }} />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/50 pointer-events-none" />

      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(0deg, rgba(5,15,25,0.4) 0%, transparent 50%)' }} />

      <OceanCanvas />

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl px-8 flex flex-col items-center gap-5">
        <div className="text-center">
          <h1 className="font-serif font-light text-white mb-2"
            style={{ fontSize: 'clamp(2.8rem, 6vw, 4rem)', textShadow: '0 2px 40px rgba(0,30,80,0.8)' }}>
            Session Instructions
          </h1>
          <p className="font-sans text-base font-light tracking-wide"
            style={{ color: 'rgba(160,200,230,0.6)' }}>
            What to expect during your 15-minute meditation
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          {ITEMS.map((item, i) => (
            <div key={i} className="rounded-2xl flex items-start gap-5"
              style={{
                padding: '28px 32px',
                background: item.highlight ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${item.border || 'rgba(255,255,255,0.1)'}`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              }}>
              <div className="rounded-xl p-2.5 flex-shrink-0"
                style={{ background: item.bgColor }}>
                {item.icon}
              </div>
              <div>
                <h3 className="font-sans text-base font-medium mb-1"
                  style={{ color: 'rgba(255,255,255,0.88)' }}>
                  {item.title}
                </h3>
                <p className="font-sans text-sm font-light leading-relaxed"
                  style={{ color: 'rgba(190,220,240,0.82)' }}>
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
