import { useEffect, useRef } from 'react'

function MistCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const blobs = Array.from({ length: 7 }, () => ({
      x: Math.random(),
      y: 0.4 + Math.random() * 0.45,
      r: 0.25 + Math.random() * 0.3,
      speed: 0.00015 + Math.random() * 0.0001,
      opacity: 0.04 + Math.random() * 0.06,
      phase: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      blobs.forEach(b => {
        b.x += b.speed
        const yOff = Math.sin(b.x * 3 + b.phase) * 0.015
        const cx = b.x * W
        const cy = (b.y + yOff) * H
        const r = b.r * W

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        g.addColorStop(0, `rgba(200, 218, 235, ${b.opacity})`)
        g.addColorStop(1, 'rgba(200, 218, 235, 0)')

        ctx.beginPath()
        ctx.ellipse(cx, cy, r, r * 0.4, 0, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()

        if (b.x > 1.35) b.x = -0.35
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

const CARDS = [
  {
    icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>),
    title: 'What We Collect',
    body: 'Only information you choose to share: questions, reflections, and basic session timing. No personal files, emails, or academic records.',
  },
  {
    icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>),
    title: 'EEG Data',
    body: 'The headset provides live wellness metrics for real-time demonstration only. No EEG data can be exported, stored, or accessed after your session ends.',
  },
  {
    icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>),
    title: "What We Don't Keep",
    body: 'No personal identifiers, medical records, academic information, or device files are retained. Your data is not saved or archived.',
  },
  {
    icon: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>),
    title: 'Your Control',
    body: 'Sessions are ephemeral. When you finish, all live metrics disappear and conversation context is cleared. You control what you share.',
  },
]

export default function Slide2Privacy() {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {/* Photo background */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(/IMG_2211.JPG)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }} />

      {/* Dark overlay so cards remain readable */}
      <div className="absolute inset-0 bg-black/52 pointer-events-none" />

      <MistCanvas />

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl px-8 flex flex-col items-center gap-5">
        <div className="text-center">
          <h1 className="font-serif font-light text-white mb-2"
            style={{ fontSize: 'clamp(2.8rem, 6vw, 4rem)', textShadow: '0 2px 30px rgba(0,0,0,0.5)' }}>
            Privacy &amp; Transparency
          </h1>
          <p className="font-sans text-base font-light tracking-wide"
            style={{ color: 'rgba(200,220,230,0.65)' }}>
            Your safety and trust are our priorities
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
          {CARDS.map((card, i) => (
            <div key={i} className="rounded-2xl flex flex-col gap-4"
              style={{
                padding: '30px 35px',
                background: 'rgba(255,255,255,0.09)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.16)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
              }}>
              <div className="flex items-center gap-3">
                <div style={{ color: 'rgba(170,210,240,0.9)' }}>{card.icon}</div>
                <h3 className="font-sans text-base font-semibold" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {card.title}
                </h3>
              </div>
              <p className="font-sans text-sm font-light leading-relaxed"
                style={{ color: 'rgba(210,228,242,0.8)' }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>

        <p className="font-sans text-[10px] tracking-widest text-center"
          style={{ color: 'rgba(200,220,230,0.5)' }}>
          This pilot prioritizes transparency and minimal data handling to deliver a safe wellness experience
        </p>
      </div>
    </div>
  )
}
