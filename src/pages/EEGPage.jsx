import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'

// ── Channel config (OpenBCI Ganglion = 4 channels) ─────────────────────────
const CHANNELS = [
  { name: 'CH1', region: 'Frontal', desc: 'Left frontal',  color: '#6ee7b7' },
  { name: 'CH2', region: 'Frontal', desc: 'Right frontal', color: '#67e8f9' },
  { name: 'CH3', region: 'Central', desc: 'Left central',  color: '#93c5fd' },
  { name: 'CH4', region: 'Central', desc: 'Right central', color: '#c4b5fd' },
]

const WS_URL     = 'ws://localhost:8765'
const BUFFER_LEN = 400
const EEG_SCALE  = 150

const INSIGHTS = [
  { label: 'Relaxation', value: 71, color: '#6ee7b7' },
  { label: 'Focus',      value: 64, color: '#93c5fd' },
  { label: 'Stress',     value: 28, color: '#fca5a5' },
]

// ── Waveform canvas ────────────────────────────────────────────────────────
function WaveformCanvas({ bufRef, color, isLive }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const loop = () => {
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      if (W !== canvas.width || H !== canvas.height) {
        canvas.width  = W
        canvas.height = H
      }

      ctx.clearRect(0, 0, W, H)

      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.setLineDash([])

      const data = bufRef.current
      if (isLive && data) {
        const grad = ctx.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0,    `${color}00`)
        grad.addColorStop(0.08, `${color}88`)
        grad.addColorStop(0.5,  color)
        grad.addColorStop(1,    color)

        ctx.beginPath()
        ctx.strokeStyle = grad
        ctx.lineWidth   = 1.5
        ctx.shadowColor = color
        ctx.shadowBlur  = 5

        const step = W / (data.length - 1)
        data.forEach((v, i) => {
          const x = i * step
          const y = H / 2 - v * (H * 0.4)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      animRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(animRef.current)
  }, [isLive, color, bufRef])

  return <canvas ref={canvasRef} className="w-full h-full" />
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(s) {
  const m   = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

const STATUS = {
  disconnected: { dot: 'bg-red-500',    shadow: 'rgba(239,68,68,0.8)',  bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.18)',  text: 'rgba(248,113,113,0.85)', label: 'Disconnected' },
  connecting:   { dot: 'bg-yellow-400', shadow: 'rgba(250,204,21,0.8)', bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.18)', text: 'rgba(253,224,71,0.85)',  label: 'Connecting…'  },
  connected:    { dot: 'bg-green-400',  shadow: 'rgba(74,222,128,0.8)', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.18)', text: 'rgba(134,239,172,0.85)', label: 'Connected'    },
  error:        { dot: 'bg-red-500',    shadow: 'rgba(239,68,68,0.8)',  bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.18)',  text: 'rgba(248,113,113,0.85)', label: 'Error'        },
}

// ── Main component ─────────────────────────────────────────────────────────
export default function EEGPage() {
  const [wsStatus,    setWsStatus]    = useState('disconnected')
  const [isRunning,   setIsRunning]   = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed,     setElapsed]     = useState(0)
  const [amplitudes,  setAmplitudes]  = useState(CHANNELS.map(() => '—'))

  const wsRef    = useRef(null)
  const timerRef = useRef(null)

  const channelBufRefs = useRef(
    CHANNELS.map(() => ({ current: new Array(BUFFER_LEN).fill(0) }))
  )

  const isLive = wsStatus === 'connected'
  const sc     = STATUS[wsStatus]

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
      setIsRecording(false)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  useEffect(() => {
    if (!isLive) { setAmplitudes(CHANNELS.map(() => '—')); return }
    const id = setInterval(() => {
      setAmplitudes(channelBufRefs.current.map(ref => {
        const buf = ref.current
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)
        return (rms * EEG_SCALE).toFixed(1)
      }))
    }, 500)
    return () => clearInterval(id)
  }, [isLive])

  const connectDevice = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setWsStatus('connecting')
    const ws = new WebSocket(WS_URL)
    ws.onopen    = () => setWsStatus('connected')
    ws.onclose   = () => {
      setWsStatus('disconnected')
      setIsRunning(false)
      channelBufRefs.current.forEach(ref => ref.current.fill(0))
    }
    ws.onerror   = () => setWsStatus('error')
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type !== 'eeg') return
        msg.channels.forEach((samples, i) => {
          if (i >= CHANNELS.length) return
          const buf = channelBufRefs.current[i].current
          samples.forEach(v => { buf.shift(); buf.push(v / EEG_SCALE) })
        })
      } catch { /* malformed frame */ }
    }
    wsRef.current = ws
  }, [])

  const handleStop = () => { setIsRunning(false); setElapsed(0) }

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col"
      style={{ background: '#0a0a0a', fontFamily: "'Outfit', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-7 py-3.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(10,10,10,0.95)' }}>

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

          <span className="font-serif text-lg font-light" style={{ color: 'rgba(255,255,255,0.82)' }}>
            EEG Monitor
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full"
            style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}
              style={{ boxShadow: `0 0 6px ${sc.shadow}`, animation: 'pulse 2s infinite' }} />
            <span className="font-sans text-xs" style={{ color: sc.text }}>{sc.label}</span>
          </div>

          <button onClick={connectDevice}
            className="font-sans text-xs px-4 py-1.5 rounded-full tracking-wide transition-all duration-200 hover:opacity-90"
            style={{ background: 'rgba(100,160,255,0.1)', border: '1px solid rgba(100,160,255,0.2)', color: 'rgba(140,190,255,0.8)' }}>
            Connect Device
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

          <span className="font-sans text-sm tabular-nums font-light w-12 text-center"
            style={{ color: isRunning ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}>
            {formatTime(elapsed)}
          </span>

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

      {/* ── Two-box layout ── */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">

        {/* ── Left box: Waveforms ── */}
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.08)' }}>

          <div className="flex items-center px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-sans text-[10px] tracking-[0.3em] uppercase"
              style={{ color: 'rgba(255,255,255,0.25)' }}>EEG Channels</span>
          </div>

          <div className="flex-1 flex flex-col px-5 py-4 overflow-hidden">
            {!isRunning && (
              <div className="mb-3 flex items-center gap-3 px-4 py-3 rounded-xl flex-shrink-0"
                style={{ background: 'rgba(100,160,255,0.05)', border: '1px solid rgba(100,160,255,0.1)' }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  style={{ color: 'rgba(120,170,255,0.6)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="font-sans text-xs" style={{ color: 'rgba(160,195,255,0.55)' }}>
                  Connect the EEG headset, then press <strong style={{ color: 'rgba(110,231,183,0.7)' }}>Start</strong> to begin streaming.
                </p>
              </div>
            )}

            <div className="flex-1 flex flex-col justify-around">
              {CHANNELS.map((ch, i) => (
                <div key={ch.name} className="flex items-center gap-3" style={{ height: '68px' }}>
                  <div className="w-16 flex-shrink-0 flex flex-col items-end gap-0.5">
                    <span className="font-sans text-xs font-medium" style={{ color: ch.color + 'cc' }}>{ch.name}</span>
                    <span className="font-sans text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{ch.desc}</span>
                  </div>
                  <div className="flex-1 h-full rounded-lg overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <WaveformCanvas bufRef={channelBufRefs.current[i]} color={ch.color} isLive={isLive} />
                  </div>
                  <div className="w-14 flex-shrink-0 text-right">
                    <span className="font-sans text-[10px] tabular-nums"
                      style={{ color: isLive ? ch.color + '80' : 'rgba(255,255,255,0.15)' }}>
                      {isLive ? `${amplitudes[i]} μV` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right box: Insights ── */}
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.08)' }}>

          <div className="flex items-center px-5 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-sans text-[10px] tracking-[0.3em] uppercase"
              style={{ color: 'rgba(255,255,255,0.25)' }}>Session Insights</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-8 py-6">
            {/* Vertical bar chart */}
            <div className="w-full flex gap-6" style={{ height: '280px' }}>
              {INSIGHTS.map(m => (
                <div key={m.label} className="flex flex-col items-center gap-3 flex-1 h-full">
                  <span className="font-sans text-sm font-medium tabular-nums flex-shrink-0"
                    style={{ color: isRunning ? m.color : 'rgba(255,255,255,0.2)' }}>
                    {isRunning ? `${m.value}%` : '—'}
                  </span>
                  <div className="flex-1 w-14 rounded-2xl relative overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="absolute bottom-0 left-0 right-0 rounded-2xl"
                      style={{
                        height: isRunning ? `${m.value}%` : '0%',
                        background: `linear-gradient(0deg, ${m.color}40, ${m.color}cc)`,
                        transition: 'height 1.4s cubic-bezier(0.4,0,0.2,1)',
                        boxShadow: isRunning ? `0 0 20px ${m.color}30` : 'none',
                      }} />
                  </div>
                  <span className="font-sans text-xs font-light flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {m.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-5 w-full" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex justify-between items-center">
                <span className="font-sans text-[10px] tracking-widest uppercase"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>Duration</span>
                <span className="font-sans text-sm tabular-nums"
                  style={{ color: 'rgba(255,255,255,0.45)' }}>{formatTime(elapsed)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
