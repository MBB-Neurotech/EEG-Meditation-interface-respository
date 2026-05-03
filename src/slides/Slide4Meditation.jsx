import { useEffect, useRef } from 'react'

function DustCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame, t = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const motes = Array.from({ length: 50 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 3 + 0.8,
      speed: Math.random() * 0.0007 + 0.0002,
      drift: (Math.random() - 0.5) * 0.0003,
      opacity: Math.random() * 0.28 + 0.06,
      phase: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      t += 0.01
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      motes.forEach(m => {
        const wobble = Math.sin(t + m.phase) * 0.007
        const cx = (m.x + wobble) * W
        const cy = m.y * H

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m.r * 3.5)
        g.addColorStop(0, `rgba(130, 160, 205, ${m.opacity})`)
        g.addColorStop(1, 'rgba(130, 160, 205, 0)')

        ctx.beginPath()
        ctx.arc(cx, cy, m.r * 3.5, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()

        m.y -= m.speed
        m.x += m.drift
        if (m.y < -0.05) { m.y = 1.05; m.x = Math.random() }
        if (m.x < 0) m.x = 1
        if (m.x > 1) m.x = 0
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

export default function Slide4Meditation() {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #edf1f8 0%, #e6ecf5 45%, #dfe8f2 100%)' }}>

      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 75% 55% at 50% 18%, rgba(150,185,240,0.25) 0%, transparent 70%)' }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 52%, rgba(175,195,220,0.28) 100%)' }} />

      <DustCanvas />

      <div className="relative z-10 flex flex-col items-center gap-6 px-10 w-full max-w-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Play icon */}
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.92)',
              boxShadow: '0 6px 32px rgba(90,130,220,0.22), 0 2px 8px rgba(0,0,0,0.06)',
            }}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              style={{ color: '#4572c8' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="font-serif font-light mb-2"
              style={{ fontSize: 'clamp(2.8rem, 6vw, 4.4rem)', color: '#263a52', letterSpacing: '-0.015em' }}>
              Guided Meditation
            </h1>
            <p className="font-sans text-base font-light tracking-wide" style={{ color: '#6e8aa8' }}>
              Your 15-minute meditation session will begin here
            </p>
          </div>
        </div>

        {/* Video placeholder */}
        <div className="w-full max-w-xl rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.78)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 8px 48px rgba(75,110,185,0.13), 0 2px 12px rgba(0,0,0,0.06)',
            border: '1px solid rgba(150,185,235,0.35)',
          }}>
          <div className="relative" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/UkOISzx-mjE"
              title="Guided Meditation"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  )
}
