import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

// ── Channel config (Ganglion = 4 channels) ──────────────────────────────────
const CHANNELS = [
  { name: 'Ch1', region: 'Channel', desc: 'Electrode 1', color: '#6ee7b7' },
  { name: 'Ch2', region: 'Channel', desc: 'Electrode 2', color: '#67e8f9' },
  { name: 'Ch3', region: 'Channel', desc: 'Electrode 3', color: '#93c5fd' },
  { name: 'Ch4', region: 'Channel', desc: 'Electrode 4', color: '#c4b5fd' },
]

const BUFFER_SIZE = 400
const SCALE = 50 // µV divisor — tune to taste once you see real signal

// ── Waveform canvas ──────────────────────────────────────────────────────────
function WaveformCanvas({ channelIndex, color, isRunning, eegBuffer }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  // keep isRunning fresh inside the rAF loop without restarting it
  const runningRef = useRef(isRunning)
  useEffect(() => { runningRef.current = isRunning }, [isRunning])

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

      // faint center line
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.beginPath()
      ctx.moveTo(0, H / 2)
      ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.setLineDash([])

      if (runningRef.current && eegBuffer.current[channelIndex]) {
        const grad = ctx.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0, `${color}00`)
        grad.addColorStop(0.08, `${color}88`)
        grad.addColorStop(0.5, color)
        grad.addColorStop(1, color)

        ctx.beginPath()
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.5
        ctx.shadowColor = color
        ctx.shadowBlur = 5

        const data = eegBuffer.current[channelIndex]
        const step = W / (data.length - 1)

        data.forEach((v, i) => {
          const x = i * step
          const y = (H / 2) - (v * (H * 0.4))
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      animRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(animRef.current)
  }, [channelIndex, color, eegBuffer]) // ← no isRunning here; rAF runs continuously

  return <canvas ref={canvasRef} className="w-full h-full" />
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EEGPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)

  const [connectionStatus, setConnectionStatus] = useState('Disconnected 🔴')
  const socketRef = useRef(null)

  // Ref mirror of isRunning so the socket handler always reads the latest value
  const isRunningRef = useRef(false)
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  // One buffer per channel
  const eegBuffer = useRef(
    Array.from({ length: CHANNELS.length }, () => new Array(BUFFER_SIZE).fill(0))
  )

  // ── WebSocket: set up ONCE ──
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080')
    socketRef.current = ws

    ws.onopen = () => setConnectionStatus('Connected 🟢')

    ws.onmessage = (event) => {
      if (!isRunningRef.current) return // read live value via ref — no stale closure

      let parsed
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }

      const incomingChannels = parsed.eeg || []
      incomingChannels.forEach((channelData, index) => {
        const buf = eegBuffer.current[index]
        if (!buf) return
        channelData.forEach(rawValue => {
          buf.shift()
          buf.push(rawValue / SCALE) // scale µV into roughly ±1 range
        })
      })
    }

    ws.onclose = () => setConnectionStatus('Disconnected 🔴')
    ws.onerror = () => setConnectionStatus('Error ⚠️')

    return () => ws.close()
  }, []) // ← empty deps: socket created once, never torn down on Start/Stop

  // ── Timer ──
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  const handleStop = () => {
    setIsRunning(false)
    setElapsed(0)
    eegBuffer.current = Array.from(
      { length: CHANNELS.length },
      () => new Array(BUFFER_SIZE).fill(0)
    )
  }

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
        <div className="flex items-center gap-5">
          <Link to="/"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all duration-200"
            style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="font-sans text-xs tracking-wider">Slides</span>
          </Link>
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)' }} />
          <div className="flex items-baseline gap-2.5">
            <span className="font-serif text-lg font-light" style={{ color: 'rgba(255,255,255,0.82)' }}>
              EEG Monitor
            </span>
            <span className="font-sans text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Ganglion · 4ch · 200Hz
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full"
            style={{
              background: connectionStatus.includes('Connected') ? 'rgba(110,231,183,0.08)' : 'rgba(239,68,68,0.08)',
              border: connectionStatus.includes('Connected') ? '1px solid rgba(110,231,183,0.18)' : '1px solid rgba(239,68,68,0.18)',
            }}>
            <span className="font-sans text-xs" style={{ color: connectionStatus.includes('Connected') ? 'rgba(110,231,183,0.85)' : 'rgba(248,113,113,0.85)' }}>
              {connectionStatus}
            </span>
          </div>

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
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto py-4 px-6">
          {!isRunning && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(100,160,255,0.05)', border: '1px solid rgba(100,160,255,0.1)' }}>
              <p className="font-sans text-xs" style={{ color: 'rgba(160,195,255,0.55)' }}>
                Press <strong style={{ color: 'rgba(110,231,183,0.7)' }}>Start</strong> to begin streaming live EEG.
              </p>
            </div>
          )}

          {Object.entries(grouped).map(([region, channels]) => (
            <div key={region} className="mb-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-sans text-[9px] tracking-[0.3em] uppercase"
                  style={{ color: 'rgba(255,255,255,0.22)' }}>
                  {region}
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>
              <div className="flex flex-col gap-1.5">
                {channels.map(ch => (
                  <div key={ch.name} className="flex items-center gap-3" style={{ height: '68px' }}>
                    <div className="w-20 flex-shrink-0 flex flex-col items-end gap-0.5">
                      <span className="font-sans text-xs font-medium tabular-nums" style={{ color: ch.color + 'cc' }}>{ch.name}</span>
                      <span className="font-sans text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{ch.desc}</span>
                    </div>
                    <div className="flex-1 h-full rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <WaveformCanvas
                        channelIndex={CHANNELS.findIndex(c => c.name === ch.name)}
                        color={ch.color}
                        isRunning={isRunning}
                        eegBuffer={eegBuffer}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}