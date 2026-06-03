import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'

// ── Config ───────────────────────────────────────────────────────────────────
const CHANNELS = [
  { name: 'CH1', color: '#059669' },
  { name: 'CH2', color: '#0284c7' },
  { name: 'CH3', color: '#4f46e5' },
  { name: 'CH4', color: '#7c3aed' },
]
const BUFFER_SIZE   = 400
const SCALE         = 50      // µV divisor
const HISTORY_MAX   = 1200    // 250ms × 1200 = 5 min
const BASELINE_SECS = 30      // seconds of band data to collect for baseline
const SESSION_SECS  = 15 * 60
const EMA_ALPHA     = 0.1     // smoothing factor for live metrics

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ── Simulation ───────────────────────────────────────────────────────────────
function injectSimSamples(eegBuf, phaseRef) {
  for (let ch = 0; ch < CHANNELS.length; ch++) {
    const buf = eegBuf[ch]
    for (let i = 0; i < 10; i++) {
      const t = (phaseRef.current + i) / 200
      buf.shift()
      buf.push(
        0.55 * Math.sin(2 * Math.PI * 10.5 * t + ch * 0.5) +
        0.18 * Math.sin(2 * Math.PI * 21   * t + ch * 0.3) +
        0.10 * Math.sin(2 * Math.PI *  3   * t + ch * 0.2) +
        0.06 * (Math.random() - 0.5)
      )
    }
  }
  phaseRef.current += 10
}

function simMetricsAt(t) {
  return {
    stress:     clamp(42 + 20 * Math.sin(t * 0.025)       + 4 * (Math.random() - 0.5), 0, 100),
    focus:      clamp(58 + 18 * Math.cos(t * 0.018 + 1.2) + 4 * (Math.random() - 0.5), 0, 100),
    relaxation: clamp(68 + 14 * Math.sin(t * 0.022 + 2.5) + 3 * (Math.random() - 0.5), 0, 100),
  }
}

// ── WaveformCanvas ───────────────────────────────────────────────────────────
function WaveformCanvas({ channelIndex, color, isRunning, eegBuffer }) {
  const canvasRef  = useRef(null)
  const animRef    = useRef(null)
  const runningRef = useRef(isRunning)
  useEffect(() => { runningRef.current = isRunning }, [isRunning])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const loop = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      if (W !== canvas.width || H !== canvas.height) { canvas.width = W; canvas.height = H }
      ctx.clearRect(0, 0, W, H)
      ctx.strokeStyle = 'rgba(0,30,90,0.07)'; ctx.lineWidth = 1; ctx.setLineDash([4, 8])
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
      ctx.setLineDash([])
      if (runningRef.current && eegBuffer.current[channelIndex]) {
        const data = eegBuffer.current[channelIndex]
        const grad = ctx.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0, `${color}00`); grad.addColorStop(0.1, `${color}bb`)
        grad.addColorStop(0.5, color);      grad.addColorStop(1, color)
        ctx.beginPath(); ctx.strokeStyle = grad; ctx.lineWidth = 2
        ctx.shadowColor = color; ctx.shadowBlur = 2
        const step   = W / (data.length - 1)
        const maxAbs = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0.001)
        const yScale = (H * 0.42) / maxAbs
        data.forEach((v, i) => {
          const x = i * step, y = H / 2 - v * yScale
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.stroke(); ctx.shadowBlur = 0
      }
      animRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(animRef.current)
  }, [channelIndex, color, eegBuffer])

  return <canvas ref={canvasRef} className="w-full h-full" />
}

// ── MetricBar ────────────────────────────────────────────────────────────────
function MetricBar({ label, value, color, active }) {
  const diff = Math.round((value - 50) / 5)
  const disp = active ? (diff > 0 ? `+${diff}` : `${diff}`) : '—'
  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.45)' }}>
        {label}
      </span>
      <div className="relative flex-1 w-10 rounded-xl overflow-hidden" style={{ background: 'rgba(70,130,200,0.1)' }}>
        <div className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${value}%`,
            background: `linear-gradient(0deg, ${color}cc, ${color}44)`,
            transition: 'height 0.8s cubic-bezier(0.4,0,0.2,1)',
          }} />
      </div>
      <span style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', fontWeight: 500, color, lineHeight: 1 }}>
        {disp}
      </span>
    </div>
  )
}

// ── MetricsChart ─────────────────────────────────────────────────────────────
const METRIC_COLORS = { stress: '#dc2626', focus: '#4f46e5', relaxation: '#059669' }

function MetricsChart({ historyRef }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const loop = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      if (W !== canvas.width || H !== canvas.height) { canvas.width = W; canvas.height = H }
      ctx.clearRect(0, 0, W, H)
      const PAD_B = 18, PAD_T = 6
      ;[25, 50, 75].forEach(pct => {
        const y = PAD_T + (H - PAD_T - PAD_B) * (1 - pct / 100)
        ctx.strokeStyle = 'rgba(0,30,90,0.07)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6])
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = 'rgba(15,30,65,0.28)'; ctx.font = '8px system-ui'
        ctx.textAlign = 'right'; ctx.fillText(`${pct}`, W - 3, y - 2)
      })
      ctx.fillStyle = 'rgba(15,30,65,0.28)'; ctx.font = '8px system-ui'
      ctx.textAlign = 'left';  ctx.fillText('0', 3, H - 3)
      ctx.textAlign = 'right'; ctx.fillText('5 min', W - 3, H - 3)
      const history = historyRef.current
      if (history.length >= 2) {
        const xStep = W / (HISTORY_MAX - 1)
        const xOff  = Math.max(0, HISTORY_MAX - history.length) * xStep
        Object.entries(METRIC_COLORS).forEach(([key, color]) => {
          ctx.beginPath(); ctx.strokeStyle = color + 'cc'; ctx.lineWidth = 1.5
          ctx.shadowColor = color; ctx.shadowBlur = 2
          history.forEach((pt, i) => {
            const x = xOff + i * xStep
            const y = PAD_T + (H - PAD_T - PAD_B) * (1 - pt[key] / 100)
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          })
          ctx.stroke()
        })
        ctx.shadowBlur = 0
      }
      animRef.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(animRef.current)
  }, [historyRef])

  return <canvas ref={canvasRef} className="w-full h-full" />
}

function formatTime(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

// ── EEGPage ──────────────────────────────────────────────────────────────────
export default function EEGPage() {
  const navigate = useNavigate()

  const [isRunning,        setIsRunning]        = useState(false)
  const [elapsed,          setElapsed]          = useState(0)
  const [connectionStatus, setConnectionStatus] = useState('Disconnected')
  const [signalQuality,    setSignalQuality]    = useState('unknown')
  const socketRef       = useRef(null)
  const timerRef        = useRef(null)
  const sessionStartRef = useRef(null)
  const isRunningRef    = useRef(false)
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  const eegBuffer = useRef(
    Array.from({ length: CHANNELS.length }, () => new Array(BUFFER_SIZE).fill(0))
  )

  const [simMode,       setSimMode]       = useState(false)
  const [metrics,       setMetrics]       = useState({ stress: 0, focus: 0, relaxation: 0 })
  const [baselineReady, setBaselineReady] = useState(false)
  const [timeLeft,      setTimeLeft]      = useState(SESSION_SECS)
  const [timerDone,     setTimerDone]     = useState(false)

  const metricsHistoryRef  = useRef([])
  // { stress: [], focus: [], relaxation: [] } — raw log-ratio samples during calibration
  const baselineSamplesRef = useRef({ stress: [], focus: [], relaxation: [] })
  // { mean: { stress, focus, relaxation }, std: { ... } } — set after calibration
  const baselineStatsRef   = useRef(null)
  // EMA-smoothed metric values
  const smoothedRef        = useRef({ stress: 50, focus: 50, relaxation: 50 })
  const simPhaseRef        = useRef(0)
  const simModeRef         = useRef(false)
  const elapsedRef         = useRef(0)
  useEffect(() => { simModeRef.current = simMode }, [simMode])
  useEffect(() => { elapsedRef.current = elapsed  }, [elapsed])

  // ── WebSocket ────────────────────────────────────────────────────────────
  const connectDevice = useCallback(() => {
    if (simMode) return
    if (socketRef.current) { socketRef.current.close(); socketRef.current = null }
    setConnectionStatus('Connecting…')
    const ws = new WebSocket('ws://localhost:8765')
    socketRef.current = ws
    ws.onopen  = () => setConnectionStatus('Connected')
    ws.onclose = () => { setConnectionStatus('Disconnected'); setSignalQuality('unknown') }
    ws.onerror = () => setConnectionStatus('Error')
    ws.onmessage = (event) => {
      if (!isRunningRef.current) return
      let parsed
      try { parsed = JSON.parse(event.data) } catch { return }

      // Always update waveform buffer with raw samples
      const incomingChannels = parsed.channels || []
      incomingChannels.forEach((channelData, index) => {
        const buf = eegBuffer.current[index]
        if (!buf) return
        channelData.forEach(v => { buf.shift(); buf.push(v / SCALE) })
      })

      // Signal quality badge
      const quality = parsed.signal_quality || 'unknown'
      setSignalQuality(quality)

      // Only process metrics when bridge has sent band powers (every 250ms)
      if (!parsed.bands) return

      const bands = parsed.bands
      const eps   = 1e-10

      // Log-ratio raw metrics from relative band powers
      const raw = {
        relaxation: Math.log(bands.alpha / (bands.beta  + eps)),
        focus:      Math.log(bands.beta  / (bands.theta + eps)),
        stress:     Math.log((bands.beta + bands.theta) / (bands.alpha + eps)),
      }

      if (!baselineStatsRef.current) {
        // Accumulate baseline samples (4 samples/sec × 30s = 120 samples)
        const s = baselineSamplesRef.current
        s.stress.push(raw.stress); s.focus.push(raw.focus); s.relaxation.push(raw.relaxation)

        if (s.stress.length >= BASELINE_SECS * 4) {
          const mean = arr => arr.reduce((a, v) => a + v, 0) / arr.length
          const std  = (arr, m) => Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / arr.length)
          const mu = { stress: mean(s.stress), focus: mean(s.focus), relaxation: mean(s.relaxation) }
          const sg = {
            stress:     std(s.stress, mu.stress),
            focus:      std(s.focus,  mu.focus),
            relaxation: std(s.relaxation, mu.relaxation),
          }
          baselineStatsRef.current = { mean: mu, std: sg }
          setBaselineReady(true)
        }
        return
      }

      // Z-score → sigmoid (→ 0-100, baseline mean → 50) → EMA smooth
      const { mean: mu, std: sg } = baselineStatsRef.current
      const sigmoid = z => 100 / (1 + Math.exp(-z))
      const prev    = smoothedRef.current
      const next    = {}
      Object.keys(raw).forEach(k => {
        const z = (raw[k] - mu[k]) / (sg[k] + eps)
        next[k] = EMA_ALPHA * sigmoid(z) + (1 - EMA_ALPHA) * prev[k]
      })
      smoothedRef.current = next
      setMetrics({ ...next })
      metricsHistoryRef.current.push({ ...next, t: elapsedRef.current })
      if (metricsHistoryRef.current.length > HISTORY_MAX) metricsHistoryRef.current.shift()
    }
  }, [simMode])

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      sessionStartRef.current = sessionStartRef.current || new Date().toISOString()
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  // ── 15-min countdown (starts after baseline ready, or immediately in sim) ─
  useEffect(() => {
    if (!isRunning || (!baselineReady && !simMode) || timeLeft <= 0) return
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setTimerDone(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [isRunning, baselineReady, simMode, timeLeft])

  // ── Sim: inject fake EEG samples every 50ms ───────────────────────────────
  useEffect(() => {
    if (!simMode || !isRunning) return
    const id = setInterval(() => injectSimSamples(eegBuffer.current, simPhaseRef), 50)
    return () => clearInterval(id)
  }, [simMode, isRunning])

  // ── Sim: generate fake metrics at 250ms ──────────────────────────────────
  useEffect(() => {
    if (!simMode || !isRunning) return
    const id = setInterval(() => {
      const m = simMetricsAt(elapsedRef.current)
      smoothedRef.current = m
      setMetrics(m)
      metricsHistoryRef.current.push({ ...m, t: elapsedRef.current })
      if (metricsHistoryRef.current.length > HISTORY_MAX) metricsHistoryRef.current.shift()
    }, 250)
    return () => clearInterval(id)
  }, [simMode, isRunning])

  // ── Navigate to summary ───────────────────────────────────────────────────
  const goToSummary = useCallback(() => {
    const sessionData = {
      history:   [...metricsHistoryRef.current],
      elapsed:   elapsedRef.current,
      startTime: sessionStartRef.current,
    }
    eegBuffer.current           = Array.from({ length: CHANNELS.length }, () => new Array(BUFFER_SIZE).fill(0))
    metricsHistoryRef.current   = []; simPhaseRef.current = 0
    baselineSamplesRef.current  = { stress: [], focus: [], relaxation: [] }
    baselineStatsRef.current    = null
    smoothedRef.current         = { stress: 50, focus: 50, relaxation: 50 }
    sessionStartRef.current     = null
    setIsRunning(false); setElapsed(0)
    setTimeLeft(SESSION_SECS); setTimerDone(false)
    setBaselineReady(false)
    setMetrics({ stress: 0, focus: 0, relaxation: 0 })
    navigate('/summary', { state: sessionData })
  }, [navigate])

  const handleStop = () => {
    if (metricsHistoryRef.current.length > 0) {
      goToSummary()
    } else {
      eegBuffer.current          = Array.from({ length: CHANNELS.length }, () => new Array(BUFFER_SIZE).fill(0))
      metricsHistoryRef.current  = []; simPhaseRef.current = 0
      baselineSamplesRef.current = { stress: [], focus: [], relaxation: [] }
      baselineStatsRef.current   = null
      smoothedRef.current        = { stress: 50, focus: 50, relaxation: 50 }
      setIsRunning(false); setElapsed(0)
      setTimeLeft(SESSION_SECS); setTimerDone(false)
      setBaselineReady(false)
      setMetrics({ stress: 0, focus: 0, relaxation: 0 })
    }
  }

  useEffect(() => { if (timerDone) goToSummary() }, [timerDone, goToSummary])

  const recalibrate = () => {
    baselineSamplesRef.current = { stress: [], focus: [], relaxation: [] }
    baselineStatsRef.current   = null
    smoothedRef.current        = { stress: 50, focus: 50, relaxation: 50 }
    setBaselineReady(false)
  }

  const isLive = simMode || connectionStatus === 'Connected'

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(150deg,#eaf3fc 0%,#dce8f7 55%,#e5eef8 100%)', fontFamily: "'Outfit', system-ui, sans-serif", color: '#0f1e3d' }}>

      {/* ── Top bar ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid rgba(70,130,200,0.15)', background: 'rgba(234,243,252,0.97)', backdropFilter: 'blur(12px)' }}>

        <div className="flex items-center gap-4">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(70,130,200,0.2)', color: 'rgba(15,30,65,0.5)', textDecoration: 'none', fontSize: 12 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Slides
          </Link>
          <div style={{ width: 1, height: 18, background: 'rgba(70,130,200,0.2)' }} />
          <span style={{ fontSize: 17, fontWeight: 300, color: 'rgba(15,30,65,0.88)', fontFamily: 'Georgia, serif' }}>EEG Monitor</span>
          <span style={{ fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.35)' }}>Ganglion · 4ch · 200Hz</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Sim toggle */}
          <button onClick={() => { if (!isRunning) setSimMode(m => !m) }}
            style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, cursor: isRunning ? 'not-allowed' : 'pointer', opacity: isRunning ? 0.5 : 1, background: simMode ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.6)', border: simMode ? '1px solid rgba(161,120,0,0.3)' : '1px solid rgba(70,130,200,0.2)', color: simMode ? '#7a5200' : 'rgba(15,30,65,0.45)' }}>
            {simMode ? '⚡ Sim On' : 'Sim'}
          </button>

          {/* Connect button */}
          {!simMode && (
            <button onClick={connectDevice}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 999, cursor: 'pointer', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(70,130,200,0.3)', color: 'rgba(15,30,65,0.6)' }}>
              Connect Device
            </button>
          )}

          {/* Signal quality badge */}
          {!simMode && connectionStatus === 'Connected' && (
            <div className="flex items-center gap-2" style={{ padding: '4px 10px', borderRadius: 999, background: signalQuality === 'good' ? 'rgba(5,150,105,0.08)' : 'rgba(245,158,11,0.1)', border: `1px solid ${signalQuality === 'good' ? 'rgba(5,150,105,0.25)' : 'rgba(161,120,0,0.25)'}` }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: signalQuality === 'good' ? '#059669' : '#f59e0b' }} />
              <span style={{ fontSize: 10, color: signalQuality === 'good' ? '#065f46' : '#7a5200' }}>
                {signalQuality === 'good' ? 'Good Signal' : 'Poor Signal'}
              </span>
            </div>
          )}

          {/* Connection status */}
          <div className="flex items-center gap-2" style={{ padding: '5px 14px', borderRadius: 999, background: isLive ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.07)', border: `1px solid ${isLive ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.2)'}` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: isLive ? '#059669' : '#dc2626', boxShadow: `0 0 5px ${isLive ? 'rgba(5,150,105,0.6)' : 'rgba(220,38,38,0.6)'}` }} />
            <span style={{ fontSize: 11, color: isLive ? '#065f46' : '#991b1b' }}>
              {simMode ? 'Sim Active' : connectionStatus}
            </span>
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(70,130,200,0.2)' }} />

          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 400, width: 48, textAlign: 'center', color: isRunning ? 'rgba(15,30,65,0.75)' : 'rgba(15,30,65,0.3)' }}>
            {formatTime(elapsed)}
          </span>

          <button onClick={() => isRunning ? handleStop() : setIsRunning(true)}
            style={{ fontSize: 11, padding: '6px 18px', borderRadius: 999, fontWeight: 500, cursor: 'pointer', background: isRunning ? 'rgba(220,38,38,0.1)' : 'rgba(5,150,105,0.1)', border: isRunning ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(5,150,105,0.3)', color: isRunning ? '#991b1b' : '#065f46' }}>
            {isRunning ? '■ Stop' : '▶ Start'}
          </button>
        </div>
      </header>

      {/* ── Two-panel main area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — EEG waveforms */}
        <div className="flex flex-col overflow-hidden" style={{ width: '55%', borderRight: '1px solid rgba(70,130,200,0.13)', padding: '14px 18px' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)' }}>EEG</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(70,130,200,0.15)' }} />
          </div>
          <div className="flex flex-col flex-1 gap-2" style={{ minHeight: 0 }}>
            {CHANNELS.map((ch, i) => (
              <div key={ch.name} className="flex gap-3 flex-1" style={{ minHeight: 0, alignItems: 'stretch' }}>
                <span style={{ width: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 11, fontWeight: 600, color: ch.color, fontVariantNumeric: 'tabular-nums' }}>
                  {ch.name}
                </span>
                <div className="flex-1 rounded-lg overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(70,130,200,0.13)', boxShadow: '0 1px 8px rgba(60,100,180,0.06)' }}>
                  <WaveformCanvas channelIndex={i} color={ch.color} isRunning={isRunning} eegBuffer={eegBuffer} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Insights */}
        <div className="flex flex-col overflow-hidden" style={{ width: '45%', padding: '14px 18px' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)' }}>Insights</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(70,130,200,0.15)' }} />
            {isRunning && !simMode && (
              <button onClick={recalibrate} style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(70,130,200,0.2)', color: 'rgba(15,30,65,0.45)', cursor: 'pointer' }}>
                Recalibrate
              </button>
            )}
          </div>

          {/* 15-min countdown ring */}
          <div className="flex flex-col items-center" style={{ marginBottom: 14 }}>
            <div style={{ position: 'relative', width: 110, height: 110 }}>
              <svg width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(70,130,200,0.12)" strokeWidth="5" />
                <circle cx="55" cy="55" r="46" fill="none"
                  stroke={timerDone ? '#dc2626' : timeLeft < 60 ? '#f59e0b' : '#059669'}
                  strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 46}`}
                  strokeDashoffset={`${2 * Math.PI * 46 * (1 - timeLeft / SESSION_SECS)}`}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: timerDone ? '#dc2626' : 'rgba(15,30,65,0.8)', lineHeight: 1 }}>
                  {timerDone ? 'Done' : formatTime(timeLeft)}
                </span>
                <span style={{ fontSize: 8, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.35)', marginTop: 3 }}>
                  {timerDone ? 'session complete' : 'remaining'}
                </span>
              </div>
            </div>
          </div>

          {/* Metric bars */}
          <div className="flex gap-3" style={{ height: 160, marginBottom: 14 }}>
            <MetricBar label="Stress"     value={isRunning ? metrics.stress     : 0} color="#dc2626" active={isRunning} />
            <MetricBar label="Focus"      value={isRunning ? metrics.focus      : 0} color="#4f46e5" active={isRunning} />
            <MetricBar label="Relaxation" value={isRunning ? metrics.relaxation : 0} color="#059669" active={isRunning} />
          </div>

          {/* Status notices */}
          {isRunning && !simMode && !baselineReady && connectionStatus !== 'Connected' && (
            <div style={{ marginBottom: 10, padding: '6px 12px', borderRadius: 8, background: 'rgba(70,130,200,0.08)', border: '1px solid rgba(70,130,200,0.2)' }}>
              <span style={{ fontSize: 10, color: 'rgba(15,30,65,0.55)' }}>Connect device to begin calibration</span>
            </div>
          )}
          {isRunning && !simMode && !baselineReady && connectionStatus === 'Connected' && (
            <div style={{ marginBottom: 10, padding: '6px 12px', borderRadius: 8, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(161,120,0,0.2)' }}>
              <span style={{ fontSize: 10, color: '#7a5200' }}>
                Calibrating baseline — {Math.max(0, BASELINE_SECS - elapsed)}s remaining
              </span>
            </div>
          )}

          {/* Chart legend */}
          <div className="flex items-center gap-4" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.3)' }}>History (5 min)</span>
            {Object.entries(METRIC_COLORS).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1">
                <span style={{ width: 10, height: 2, background: color, borderRadius: 1, display: 'inline-block' }} />
                <span style={{ fontSize: 9, color: 'rgba(15,30,65,0.4)', textTransform: 'capitalize' }}>{key}</span>
              </div>
            ))}
          </div>

          {/* Scrolling line chart */}
          <div className="flex-1 rounded-xl overflow-hidden" style={{ minHeight: 0, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(70,130,200,0.13)', boxShadow: '0 1px 8px rgba(60,100,180,0.06)' }}>
            <MetricsChart historyRef={metricsHistoryRef} />
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="flex-shrink-0 flex items-center justify-end px-6 py-2.5"
        style={{ borderTop: '1px solid rgba(70,130,200,0.13)', background: 'rgba(234,243,252,0.7)' }}>
        <button
          onClick={() => navigate('/summary', { state: { history: metricsHistoryRef.current, elapsed: elapsedRef.current, startTime: sessionStartRef.current } })}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, letterSpacing: '0.08em', padding: '7px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(70,130,200,0.2)', color: 'rgba(15,30,65,0.5)', cursor: 'pointer' }}>
          Next
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
