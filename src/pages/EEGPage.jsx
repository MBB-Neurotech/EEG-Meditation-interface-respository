import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

// ── Channel config ─────────────────────────────────────────────────────────
const CHANNELS = [
  { name: 'Fp1', region: 'Frontal', desc: 'Left prefrontal', color: '#6ee7b7', amp: '12.4' },
  { name: 'Fp2', region: 'Frontal', desc: 'Right prefrontal', color: '#67e8f9', amp: '9.8' },
  { name: 'F3',  region: 'Frontal', desc: 'Left frontal',    color: '#93c5fd', amp: '15.1' },
  { name: 'F4',  region: 'Frontal', desc: 'Right frontal',   color: '#c4b5fd', amp: '11.7' },
  { name: 'C3',  region: 'Central', desc: 'Left central',    color: '#fca5a5', amp: '18.3' },
  { name: 'C4',  region: 'Central', desc: 'Right central',   color: '#fcd34d', amp: '7.2' },
  { name: 'P3',  region: 'Parietal', desc: 'Left parietal',  color: '#a5f3fc', amp: '13.9' },
  { name: 'P4',  region: 'Parietal', desc: 'Right parietal', color: '#86efac', amp: '10.5' },
]

const WAVE_CONFIGS = CHANNELS.map((_, i) => ({
  freq1: 8 + i * 1.4,
  freq2: 13 + i * 2.2,
  amp: 0.5 + (i % 3) * 0.13,
  noise: 0.07,
}))

function generateWave(length, cfg) {
  return Array.from({ length }, (_, i) => {
    const t = i / length
    return (
      Math.sin(t * Math.PI * 2 * cfg.freq1) * cfg.amp +
      Math.sin(t * Math.PI * 2 * cfg.freq2) * cfg.amp * 0.5 +
      (Math.random() - 0.5) * cfg.noise
    )
  })
}

// ── Waveform canvas ────────────────────────────────────────────────────────
function WaveformCanvas({ channelIndex, color, isRunning }) {
  const canvasRef = useRef(null)
  const bufferRef = useRef(generateWave(400, WAVE_CONFIGS[channelIndex]))
  const animRef = useRef(null)
  const offsetRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const loop = () => {
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      if (W !== canvas.width || H !== canvas.height) {
        canvas.width = W
        canvas.height = H
      }

      ctx.clearRect(0, 0, W, H)

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.setLineDash([])

      if (isRunning) {
        const cfg = WAVE_CONFIGS[channelIndex]
        bufferRef.current.shift()
        const t = offsetRef.current / 400
        bufferRef.current.push(
          Math.sin(t * Math.PI * 2 * cfg.freq1) * cfg.amp +
          Math.sin(t * Math.PI * 2 * cfg.freq2) * cfg.amp * 0.5 +
          (Math.random() - 0.5) * cfg.noise
        )
        offsetRef.current++
      }

      if (isRunning || bufferRef.current.some(v => v !== 0)) {
        // Gradient stroke: fade at left edge
        const grad = ctx.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0, `${color}00`)
        grad.addColorStop(0.08, `${color}88`)
        grad.addColorStop(0.5, color)
        grad.addColorStop(1, color)

        ctx.beginPath()
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.shadowColor = color
        ctx.shadowBlur = isRunning ? 5 : 0

        const data = bufferRef.current
        const step = W / (data.length - 1)
        data.forEach((v, i) => {
          const x = i * step
          const y = H / 2 - v * (H * 0.4)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke()
      }

      animRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(animRef.current)
  }, [isRunning, channelIndex, color])

  return <canvas ref={canvasRef} className="w-full h-full" />
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ── Main component ─────────────────────────────────────────────────────────
export default function EEGPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
      if (!isRunning) setIsRecording(false)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  const handleStop = () => {
    setIsRunning(false)
    setElapsed(0)
  }

  // Group channels by region
  const grouped = CHANNELS.reduce((acc, ch) => {
    if (!acc[ch.region]) acc[ch.region] = []
    acc[ch.region].push(ch)
    return acc
  }, {})

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col"
      style={{ background: '#0a0a0a', fontFamily: "'Outfit', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-7 py-3.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,10,10,0.95)' }}>
        {/* Left: back + title */}
        <div className="flex items-center gap-5">
          <Link to="/"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all duration-200"
            style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-sans text-xs tracking-wider">Slides</span>
          </Link>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)' }} />

          <div className="flex items-baseline gap-2.5">
            <span className="font-serif text-lg font-light" style={{ color: 'rgba(255,255,255,0.82)' }}>
              EEG Monitor
            </span>
            <span className="font-sans text-[9px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
              EMOTIV Lite
            </span>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2.5">
          {/* Status pill */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.18)',
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"
              style={{ boxShadow: '0 0 6px rgba(239,68,68,0.8)', animation: 'pulse 2s infinite' }} />
            <span className="font-sans text-xs" style={{ color: 'rgba(248,113,113,0.85)' }}>Disconnected</span>
          </div>

          <button
            className="font-sans text-xs px-4 py-1.5 rounded-full tracking-wide transition-all duration-200 hover:opacity-90"
            style={{
              background: 'rgba(100,160,255,0.1)',
              border: '1px solid rgba(100,160,255,0.2)',
              color: 'rgba(140,190,255,0.8)',
            }}>
            Connect Device
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

          {/* Timer */}
          <span className="font-sans text-sm tabular-nums font-light w-12 text-center"
            style={{ color: isRunning ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}>
            {formatTime(elapsed)}
          </span>

          {/* Start / Stop */}
          <button
            onClick={() => isRunning ? handleStop() : setIsRunning(true)}
            className="font-sans text-xs px-5 py-1.5 rounded-full tracking-wide font-medium transition-all duration-200"
            style={{
              background: isRunning ? 'rgba(239,68,68,0.15)' : 'rgba(110,231,183,0.12)',
              border: isRunning ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(110,231,183,0.25)',
              color: isRunning ? 'rgba(252,165,165,0.9)' : 'rgba(110,231,183,0.9)',
            }}>
            {isRunning ? '■ Stop' : '▶ Start'}
          </button>

          {/* Record */}
          <button
            onClick={() => isRunning && setIsRecording(r => !r)}
            className="font-sans text-xs px-4 py-1.5 rounded-full tracking-wide transition-all duration-200"
            style={{
              background: isRecording ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
              border: isRecording ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
              color: isRecording ? 'rgba(252,165,165,0.9)' : 'rgba(255,255,255,0.28)',
              cursor: isRunning ? 'pointer' : 'not-allowed',
              opacity: isRunning ? 1 : 0.5,
            }}>
            {isRecording ? '● Recording' : '⏺ Record'}
          </button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Waveform area */}
        <div className="flex-1 overflow-y-auto py-4 px-6">

          {/* Not running hint */}
          {!isRunning && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(100,160,255,0.05)', border: '1px solid rgba(100,160,255,0.1)' }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ color: 'rgba(120,170,255,0.6)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-sans text-xs" style={{ color: 'rgba(160,195,255,0.55)' }}>
                Connect the EMOTIV Lite headset, then press <strong style={{ color: 'rgba(110,231,183,0.7)' }}>Start</strong> to begin streaming EEG data. Waveforms will appear here in real time.
              </p>
            </div>
          )}

          {Object.entries(grouped).map(([region, channels]) => (
            <div key={region} className="mb-5">
              {/* Region label */}
              <div className="flex items-center gap-3 mb-2">
                <span className="font-sans text-[9px] tracking-[0.3em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.22)' }}>
                  {region} Lobe
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>

              {/* Channels in this region */}
              <div className="flex flex-col gap-1.5">
                {channels.map(ch => (
                  <div key={ch.name} className="flex items-center gap-3" style={{ height: '68px' }}>
                    {/* Label */}
                    <div className="w-20 flex-shrink-0 flex flex-col items-end gap-0.5">
                      <span className="font-sans text-xs font-medium tabular-nums"
                        style={{ color: ch.color + 'cc' }}>
                        {ch.name}
                      </span>
                      <span className="font-sans text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {ch.desc}
                      </span>
                    </div>

                    {/* Canvas */}
                    <div className="flex-1 h-full rounded-lg overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}>
                      <WaveformCanvas
                        channelIndex={CHANNELS.findIndex(c => c.name === ch.name)}
                        color={ch.color}
                        isRunning={isRunning}
                      />
                    </div>

                    {/* μV readout */}
                    <div className="w-14 flex-shrink-0 text-right">
                      <span className="font-sans text-[10px] tabular-nums"
                        style={{ color: isRunning ? ch.color + '80' : 'rgba(255,255,255,0.15)' }}>
                        {isRunning ? `${ch.amp} μV` : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Sidebar ── */}
        <aside className="w-60 flex-shrink-0 overflow-y-auto py-5 px-5 flex flex-col gap-5"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>

          {/* Wellness metrics */}
          <div>
            <p className="font-sans text-[9px] tracking-[0.28em] uppercase mb-3"
              style={{ color: 'rgba(255,255,255,0.2)' }}>
              Wellness Metrics
            </p>
            {[
              { label: 'Focus',      value: 64, color: '#93c5fd', unit: '%' },
              { label: 'Relaxation', value: 71, color: '#6ee7b7', unit: '%' },
              { label: 'Stress',     value: 28, color: '#fca5a5', unit: '%' },
              { label: 'Engagement', value: 55, color: '#fcd34d', unit: '%' },
            ].map(m => (
              <div key={m.label} className="py-2.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between mb-1.5">
                  <span className="font-sans text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {m.label}
                  </span>
                  <span className="font-sans text-xs font-medium tabular-nums"
                    style={{ color: isRunning ? m.color + 'cc' : 'rgba(255,255,255,0.2)' }}>
                    {isRunning ? `${m.value}%` : '—'}
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full"
                    style={{
                      background: m.color,
                      width: isRunning ? `${m.value}%` : '0%',
                      opacity: 0.65,
                      transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
                    }} />
                </div>
              </div>
            ))}
          </div>

          {/* Band power */}
          <div>
            <p className="font-sans text-[9px] tracking-[0.28em] uppercase mb-3"
              style={{ color: 'rgba(255,255,255,0.2)' }}>
              Band Power
            </p>
            {[
              { label: 'Delta', range: '0.5–4 Hz',  pct: 38, color: '#c4b5fd' },
              { label: 'Theta', range: '4–8 Hz',    pct: 52, color: '#93c5fd' },
              { label: 'Alpha', range: '8–13 Hz',   pct: 67, color: '#6ee7b7' },
              { label: 'Beta',  range: '13–30 Hz',  pct: 44, color: '#fcd34d' },
              { label: 'Gamma', range: '30–100 Hz', pct: 21, color: '#fca5a5' },
            ].map(b => (
              <div key={b.label} className="py-1.5">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-sans text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {b.label}
                  </span>
                  <span className="font-sans text-[9px]" style={{ color: 'rgba(255,255,255,0.18)' }}>
                    {b.range}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${b.color}88, ${b.color})`,
                      width: isRunning ? `${b.pct}%` : '0%',
                      transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
                    }} />
                </div>
              </div>
            ))}
          </div>

          {/* Session info */}
          <div className="mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="font-sans text-[9px] tracking-[0.28em] uppercase mb-3"
              style={{ color: 'rgba(255,255,255,0.2)' }}>
              Session Info
            </p>
            {[
              { label: 'Duration',    value: formatTime(elapsed) },
              { label: 'Sample Rate', value: '256 Hz' },
              { label: 'Channels',    value: '8 (active)' },
              { label: 'Reference',   value: 'CMS/DRL' },
            ].map(s => (
              <div key={s.label} className="flex justify-between py-1.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="font-sans text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {s.label}
                </span>
                <span className="font-sans text-[10px] tabular-nums"
                  style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
