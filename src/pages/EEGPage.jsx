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
const EEG_SCALE  = 150   // μV — normalise raw samples into [-1, 1] range for canvas

// ── Waveform canvas ────────────────────────────────────────────────────────
// bufRef.current is a plain Array that EEGPage mutates in place on every WS message.
// The canvas reads from it on every animation frame — no props change needed.
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

      // centre dashed line
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
  disconnected: { dot: 'bg-red-500',    shadow: 'rgba(239,68,68,0.8)',   bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.18)',   text: 'rgba(248,113,113,0.85)', label: 'Disconnected' },
  connecting:   { dot: 'bg-yellow-400', shadow: 'rgba(250,204,21,0.8)',  bg: 'rgba(250,204,21,0.08)',  border: 'rgba(250,204,21,0.18)',  text: 'rgba(253,224,71,0.85)',  label: 'Connecting…'  },
  connected:    { dot: 'bg-green-400',  shadow: 'rgba(74,222,128,0.8)',  bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.18)',  text: 'rgba(134,239,172,0.85)', label: 'Connected'    },
  error:        { dot: 'bg-red-500',    shadow: 'rgba(239,68,68,0.8)',   bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.18)',   text: 'rgba(248,113,113,0.85)', label: 'Error'        },
}

// ── Main component ─────────────────────────────────────────────────────────
export default function EEGPage() {
  const [wsStatus,    setWsStatus]    = useState('disconnected')
  const [isRunning,   setIsRunning]   = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed,     setElapsed]     = useState(0)
  const [amplitudes,  setAmplitudes]  = useState(CHANNELS.map(() => '—'))

  const wsRef   = useRef(null)
  const timerRef = useRef(null)

  // One buffer object per channel; mutated in-place by the WS handler.
  // Each element is { current: Array } to match React ref shape for WaveformCanvas.
  const channelBufRefs = useRef(
    CHANNELS.map(() => ({ current: new Array(BUFFER_LEN).fill(0) }))
  )

  const isLive = wsStatus === 'connected'
  const sc     = STATUS[wsStatus]

  // ── Session timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
      setIsRecording(false)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  // ── Amplitude readout (every 500 ms) ──────────────────────────────────
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

  // ── WebSocket connection ───────────────────────────────────────────────
  const connectDevice = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }

    setWsStatus('connecting')
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => setWsStatus('connected')

    ws.onclose = () => {
      setWsStatus('disconnected')
      setIsRunning(false)
      channelBufRefs.current.forEach(ref => ref.current.fill(0))
    }

    ws.onerror = () => setWsStatus('error')

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type !== 'eeg') return
        // msg.channels: Array<Array<number>>  — one inner array per EEG channel
        msg.channels.forEach((samples, i) => {
          if (i >= CHANNELS.length) return
          const buf = channelBufRefs.current[i].current
          samples.forEach(v => {
            buf.shift()
            buf.push(v / EEG_SCALE)
          })
        })
      } catch { /* malformed frame — ignore */ }
    }

    wsRef.current = ws
  }, [])

  const handleStop = () => { setIsRunning(false); setElapsed(0) }

  const grouped = CHANNELS.reduce((acc, ch) => {
    ;(acc[ch.region] ||= []).push(ch)
    return acc
  }, {})

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

          <div className="flex items-baseline gap-2.5">
            <span className="font-serif text-lg font-light" style={{ color: 'rgba(255,255,255,0.82)' }}>
              EEG Monitor
            </span>
            <span className="font-sans text-[9px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
              OpenBCI Ganglion
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Status pill */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full"
            style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`}
              style={{ boxShadow: `0 0 6px ${sc.shadow}`, animation: 'pulse 2s infinite' }} />
            <span className="font-sans text-xs" style={{ color: sc.text }}>{sc.label}</span>
          </div>

          <button
            onClick={connectDevice}
            disabled={wsStatus === 'connecting'}
            className="font-sans text-xs px-4 py-1.5 rounded-full tracking-wide transition-all duration-200 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(100,160,255,0.1)', border: '1px solid rgba(100,160,255,0.2)', color: 'rgba(140,190,255,0.8)' }}>
            {wsStatus === 'connected' ? 'Reconnect' : 'Connect Device'}
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
            disabled={!isLive}
            className="font-sans text-xs px-5 py-1.5 rounded-full tracking-wide font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: isRunning ? 'rgba(239,68,68,0.15)'    : 'rgba(110,231,183,0.12)',
              border:     isRunning ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(110,231,183,0.25)',
              color:      isRunning ? 'rgba(252,165,165,0.9)'   : 'rgba(110,231,183,0.9)',
            }}>
            {isRunning ? '■ Stop' : '▶ Start'}
          </button>

          {/* Record */}
          <button
            onClick={() => isRunning && setIsRecording(r => !r)}
            className="font-sans text-xs px-4 py-1.5 rounded-full tracking-wide transition-all duration-200"
            style={{
              background: isRecording ? 'rgba(239,68,68,0.15)'         : 'rgba(255,255,255,0.04)',
              border:     isRecording ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)',
              color:      isRecording ? 'rgba(252,165,165,0.9)'        : 'rgba(255,255,255,0.28)',
              cursor:     isRunning ? 'pointer' : 'not-allowed',
              opacity:    isRunning ? 1 : 0.5,
            }}>
            {isRecording ? '● Recording' : '⏺ Record'}
          </button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Waveform area */}
        <div className="flex-1 overflow-y-auto py-4 px-6">

          {!isLive && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(100,160,255,0.05)', border: '1px solid rgba(100,160,255,0.1)' }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ color: 'rgba(120,170,255,0.6)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-sans text-xs" style={{ color: 'rgba(160,195,255,0.55)' }}>
                Run <code style={{ color: 'rgba(110,231,183,0.7)', fontFamily: 'monospace' }}>python bridge/main.py</code> then press <strong style={{ color: 'rgba(110,231,183,0.7)' }}>Connect Device</strong>.
              </p>
            </div>
          )}

          {Object.entries(grouped).map(([region, channels]) => (
            <div key={region} className="mb-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-sans text-[9px] tracking-[0.3em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.22)' }}>
                  {region} Lobe
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>

              <div className="flex flex-col gap-1.5">
                {channels.map(ch => {
                  const idx = CHANNELS.findIndex(c => c.name === ch.name)
                  return (
                    <div key={ch.name} className="flex items-center gap-3" style={{ height: '68px' }}>
                      <div className="w-20 flex-shrink-0 flex flex-col items-end gap-0.5">
                        <span className="font-sans text-xs font-medium tabular-nums"
                          style={{ color: ch.color + 'cc' }}>
                          {ch.name}
                        </span>
                        <span className="font-sans text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                          {ch.desc}
                        </span>
                      </div>

                      <div className="flex-1 h-full rounded-lg overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <WaveformCanvas
                          bufRef={channelBufRefs.current[idx]}
                          color={ch.color}
                          isLive={isLive}
                        />
                      </div>

                      <div className="w-14 flex-shrink-0 text-right">
                        <span className="font-sans text-[10px] tabular-nums"
                          style={{ color: isLive ? ch.color + '80' : 'rgba(255,255,255,0.15)' }}>
                          {isLive ? `${amplitudes[idx]} μV` : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
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
              { label: 'Focus',      value: 64, color: '#93c5fd' },
              { label: 'Relaxation', value: 71, color: '#6ee7b7' },
              { label: 'Stress',     value: 28, color: '#fca5a5' },
              { label: 'Engagement', value: 55, color: '#fcd34d' },
            ].map(m => (
              <div key={m.label} className="py-2.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex justify-between mb-1.5">
                  <span className="font-sans text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{m.label}</span>
                  <span className="font-sans text-xs font-medium tabular-nums"
                    style={{ color: isLive ? m.color + 'cc' : 'rgba(255,255,255,0.2)' }}>
                    {isLive ? `${m.value}%` : '—'}
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full"
                    style={{
                      background: m.color,
                      width: isLive ? `${m.value}%` : '0%',
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
                  <span className="font-sans text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{b.label}</span>
                  <span className="font-sans text-[9px]" style={{ color: 'rgba(255,255,255,0.18)' }}>{b.range}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${b.color}88, ${b.color})`,
                      width: isLive ? `${b.pct}%` : '0%',
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
              { label: 'Sample Rate', value: '200 Hz' },
              { label: 'Channels',    value: '4 (active)' },
              { label: 'Board',       value: 'Ganglion' },
            ].map(s => (
              <div key={s.label} className="flex justify-between py-1.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="font-sans text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{s.label}</span>
                <span className="font-sans text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,0.45)' }}>
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
