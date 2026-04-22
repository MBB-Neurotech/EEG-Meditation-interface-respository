import { useEffect, useRef } from 'react'

function RainCanvas() {
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

    const windX = 0.12

    const drops = Array.from({ length: 160 }, () => ({
      x: Math.random() * 1.4 - 0.2,
      y: Math.random(),
      len: Math.random() * 0.045 + 0.015,
      speed: Math.random() * 0.007 + 0.005,
      opacity: Math.random() * 0.28 + 0.1,
      width: Math.random() * 0.6 + 0.3,
    }))

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      drops.forEach(d => {
        const x = d.x * W
        const y = d.y * H
        const lenH = d.len * H
        const driftX = windX * lenH

        ctx.beginPath()
        ctx.strokeStyle = `rgba(210, 230, 255, ${d.opacity})`
        ctx.lineWidth = d.width
        ctx.lineCap = 'round'
        ctx.moveTo(x, y)
        ctx.lineTo(x + driftX, y + lenH)
        ctx.stroke()

        d.y += d.speed
        d.x += windX * d.speed
        if (d.y > 1.05) {
          d.y = -d.len - Math.random() * 0.1
          d.x = Math.random() * 1.4 - 0.2
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

export default function Slide1Welcome() {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">

      {/* Photo background */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'url(/rain.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }} />

      {/* Light overlay — just enough to let text read */}
      <div className="absolute inset-0 bg-black/28 pointer-events-none" />

      <RainCanvas />

      <div className="relative z-10 flex flex-col items-center gap-5 text-center px-8">
        <p className="font-sans text-[10px] font-light tracking-[0.4em] uppercase"
          style={{ color: 'rgba(160, 210, 255, 0.7)' }}>
          Welcome to
        </p>
        <h1 className="font-serif font-light leading-[1.15]"
          style={{
            fontSize: 'clamp(2.8rem, 6vw, 4.5rem)',
            color: 'rgba(190, 225, 255, 0.95)',
            textShadow: '0 2px 40px rgba(0,0,0,0.6)',
            letterSpacing: '-0.01em',
          }}>
          MBB Neurotech<br />
          <span style={{ color: 'rgba(140, 200, 255, 0.9)' }}>Meditation Project</span>
        </h1>
        <div className="w-12 h-px mt-2" style={{ background: 'rgba(160,210,255,0.35)' }} />
      </div>
    </div>
  )
}
