import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'

// ── Config ───────────────────────────────────────────────────────────────────
// Deeper, more saturated palette — readable on a light background
const CHANNELS = [
  { name: 'CH1', color: '#059669' },
  { name: 'CH2', color: '#0284c7' },
  { name: 'CH3', color: '#4f46e5' },
  { name: 'CH4', color: '#7c3aed' },
]
const BUFFER_SIZE    = 400   // samples per channel in ring buffer
const SCALE          = 50    // µV divisor — matches friend's server.py
const SAMPLE_RATE    = 200   // Hz
const FFT_SIZE       = 256   // must be power of 2
const HISTORY_LEN    = 300   // 5 min at 1 pt/sec
const BASELINE_SECS  = 120   // seconds to collect baseline (2 min)
const SESSION_SECS   = 15 * 60

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ── FFT (Cooley-Tukey radix-2, in-place) ────────────────────────────────────
function fftInPlace(re, im) {
  const N = re.length
  let j = 0
  for (let i = 1; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1
    const ang  = -2 * Math.PI / len
    const wRe  = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < N; i += len) {
      let cRe = 1, cIm = 0
      for (let k = 0; k < half; k++) {
        const uRe = re[i+k], uIm = im[i+k]
        const vRe = re[i+k+half]*cRe - im[i+k+half]*cIm
        const vIm = re[i+k+half]*cIm + im[i+k+half]*cRe
        re[i+k]      = uRe+vRe; im[i+k]      = uIm+vIm
        re[i+k+half] = uRe-vRe; im[i+k+half] = uIm-vIm
        const nRe = cRe*wRe - cIm*wIm; cIm = cRe*wIm + cIm*wRe; cRe = nRe
      }
    }
  }
}

function singleChannelBandPowers(samples) {
  const N  = FFT_SIZE
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  for (let i = 0; i < N; i++)
    re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))) // Hann window
  fftInPlace(re, im)
  const freqRes = SAMPLE_RATE / N
  const sumBand = (lo, hi) => {
    let s = 0, c = 0
    for (let k = 1; k < N / 2; k++) {
      const f = k * freqRes
      if (f >= lo && f < hi) { s += re[k]*re[k] + im[k]*im[k]; c++ }
    }
    return c ? s / c : 0
  }
  return {
    delta: sumBand(0.5, 4),
    theta: sumBand(4,   8),
    alpha: sumBand(8,  13),
    beta:  sumBand(13, 30),
  }
}

function computeBandPowers(eegBuf) {
  const avg = { delta: 0, theta: 0, alpha: 0, beta: 0 }
  let valid = 0
  for (let ch = 0; ch < CHANNELS.length; ch++) {
    const buf = eegBuf[ch]
    if (!buf || buf.length < FFT_SIZE) continue
    const samples = buf.slice(-FFT_SIZE).map(v => v * SCALE) // un-scale → µV
    const bp = singleChannelBandPowers(samples)
    Object.keys(avg).forEach(k => { avg[k] += bp[k] })
    valid++
  }
  if (!valid) return null
  Object.keys(avg).forEach(k => { avg[k] /= valid })
  return avg
}

function bandPowersToRaw(bp) {
  const eps = 1e-10
  return {
    stress:     bp.beta  / (bp.alpha + eps),
    focus:      bp.beta  / (bp.alpha + bp.theta + eps),
    relaxation: bp.alpha,
  }
}

// Sigmoid normalization: baseline mean → 50, 2× → ~88, 0.5× → ~12
function normalizeToScore(raw, means) {
  const score = (v, m) => m ? clamp(100 / (1 + Math.exp(-4 * (v / m - 1))), 0, 100) : 50
  return {
    stress:     score(raw.stress,     means.stress),
    focus:      score(raw.focus,      means.focus),
    relaxation: score(raw.relaxation, means.relaxation),
  }
}

// ── Simulation ───────────────────────────────────────────────────────────────
function injectSimSamples(eegBuf, phaseRef) {
  for (let ch = 0; ch < CHANNELS.length; ch++) {
    const buf = eegBuf[ch]
    for (let i = 0; i < 10; i++) {
      const t = (phaseRef.current + i) / SAMPLE_RATE
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
// Unchanged from friend's version — reads eegBuffer.current[channelIndex] on each frame
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
      ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()
      ctx.setLineDash([])
      if (runningRef.current && eegBuffer.current[channelIndex]) {
        const data = eegBuffer.current[channelIndex]
        const grad = ctx.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0, `${color}00`); grad.addColorStop(0.1, `${color}bb`)
        grad.addColorStop(0.5, color);      grad.addColorStop(1, color)
        ctx.beginPath(); ctx.strokeStyle = grad; ctx.lineWidth = 2
        ctx.shadowColor = color; ctx.shadowBlur = 2
        const step = W / (data.length - 1)
        data.forEach((v, i) => {
          const x = i * step, y = H/2 - v * (H * 0.4)
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
function MetricBar({ label, value, color }) {
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
        {Math.round(value)}
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
        const xStep = W / (HISTORY_LEN - 1)
        const xOff  = Math.max(0, HISTORY_LEN - history.length) * xStep
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
  return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`
}

// ── EEGPage ──────────────────────────────────────────────────────────────────
export default function EEGPage() {

  // ── Existing state & refs (preserved exactly from friend's version) ───────
  const navigate = useNavigate()

  const [isRunning, setIsRunning] = useState(false)
  const [elapsed,   setElapsed]   = useState(0)
  const [connectionStatus, setConnectionStatus] = useState('Disconnected')
  const socketRef          = useRef(null)
  const timerRef           = useRef(null)
  const sessionStartRef    = useRef(null)
  const isRunningRef = useRef(false)
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  const eegBuffer = useRef(
    Array.from({ length: CHANNELS.length }, () => new Array(BUFFER_SIZE).fill(0))
  )

  // ── New state ─────────────────────────────────────────────────────────────
  const [simMode,       setSimMode]       = useState(false)
  const [metrics,       setMetrics]       = useState({ stress: 0, focus: 0, relaxation: 0 })
  const [calibrating,   setCalibrating]   = useState(false)
  const [baselineReady, setBaselineReady] = useState(false)
  const [timeLeft,      setTimeLeft]      = useState(SESSION_SECS)
  const [timerDone,     setTimerDone]     = useState(false)

  const metricsHistoryRef  = useRef([])
  const baselineSamplesRef = useRef({ stress: [], focus: [], relaxation: [] })
  const baselineMeansRef   = useRef(null)
  const simPhaseRef        = useRef(0)
  const simModeRef         = useRef(false)
  const elapsedRef         = useRef(0)
  useEffect(() => { simModeRef.current = simMode }, [simMode])
  useEffect(() => { elapsedRef.current = elapsed  }, [elapsed])

  // ── WebSocket (unchanged logic, guarded by simMode) ───────────────────────
  useEffect(() => {
    if (simMode) { setConnectionStatus('Simulated'); return }
    const ws = new WebSocket('ws://localhost:8080')
    socketRef.current = ws
    ws.onopen  = () => setConnectionStatus('Connected')
    ws.onclose = () => setConnectionStatus('Disconnected')
    ws.onerror = () => setConnectionStatus('Error')
    ws.onmessage = (event) => {
      if (!isRunningRef.current) return
      let parsed
      try { parsed = JSON.parse(event.data) } catch { return }
      const incomingChannels = parsed.eeg || []
      incomingChannels.forEach((channelData, index) => {
        const buf = eegBuffer.current[index]
        if (!buf) return
        channelData.forEach(rawValue => { buf.shift(); buf.push(rawValue / SCALE) })
      })
    }
    return () => ws.close()
  }, [simMode])

  // ── Timer (unchanged) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      sessionStartRef.current = sessionStartRef.current || new Date().toISOString()
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isRunning])

  // ── 15-min countdown ──────────────────────────────────────────────────────
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

  // ── Sim: inject fake EEG samples into eegBuffer every 50 ms ───────────────
  useEffect(() => {
    if (!simMode || !isRunning) return
    const id = setInterval(() => injectSimSamples(eegBuffer.current, simPhaseRef), 50)
    return () => clearInterval(id)
  }, [simMode, isRunning])

  // ── Metrics: compute band powers + update history every 1 s ───────────────
  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => {
      let m
      if (simModeRef.current) {
        m = simMetricsAt(elapsedRef.current)
      } else {
        const bp = computeBandPowers(eegBuffer.current)
        if (!bp) return
        const raw = bandPowersToRaw(bp)
        if (!baselineMeansRef.current) {
          const s = baselineSamplesRef.current
          s.stress.push(raw.stress); s.focus.push(raw.focus); s.relaxation.push(raw.relaxation)
          setCalibrating(true)
          if (elapsedRef.current >= BASELINE_SECS && s.stress.length >= 5) {
            const mean = arr => arr.reduce((a, v) => a + v, 0) / arr.length
            baselineMeansRef.current = { stress: mean(s.stress), focus: mean(s.focus), relaxation: mean(s.relaxation) }
            setBaselineReady(true); setCalibrating(false)
          }
        }
        m = baselineMeansRef.current
          ? normalizeToScore(raw, baselineMeansRef.current)
          : { stress: 50, focus: 50, relaxation: 50 }
      }
      setMetrics(m)
      metricsHistoryRef.current.push({ ...m, t: elapsedRef.current })
      if (metricsHistoryRef.current.length > HISTORY_LEN) metricsHistoryRef.current.shift()
    }, 1000)
    return () => clearInterval(id)
  }, [isRunning])

  const handleStop = () => {
    setIsRunning(false); setElapsed(0)
    setTimeLeft(SESSION_SECS); setTimerDone(false)
    eegBuffer.current = Array.from({ length: CHANNELS.length }, () => new Array(BUFFER_SIZE).fill(0))
    metricsHistoryRef.current = []; simPhaseRef.current = 0
    baselineSamplesRef.current = { stress: [], focus: [], relaxation: [] }
    baselineMeansRef.current = null
    setBaselineReady(false); setCalibrating(false)
    setMetrics({ stress: 0, focus: 0, relaxation: 0 })
  }

  const recalibrate = () => {
    baselineSamplesRef.current = { stress: [], focus: [], relaxation: [] }
    baselineMeansRef.current = null
    setBaselineReady(false); setCalibrating(false)
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

          {/* Device status */}
          <div className="flex items-center gap-2" style={{ padding: '5px 14px', borderRadius: 999, background: isLive ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.07)', border: `1px solid ${isLive ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.2)'}` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: isLive ? '#059669' : '#dc2626', boxShadow: `0 0 5px ${isLive ? 'rgba(5,150,105,0.6)' : 'rgba(220,38,38,0.6)'}` }} />
            <span style={{ fontSize: 11, color: isLive ? '#065f46' : '#991b1b' }}>
              Device Status: {connectionStatus}
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

        {/* Right — Insights (FFT) */}
        <div className="flex flex-col overflow-hidden" style={{ width: '45%', padding: '14px 18px' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)' }}>Insights (FFT)</span>
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
            <MetricBar label="Stress"     value={isRunning ? metrics.stress     : 0} color="#dc2626" />
            <MetricBar label="Focus"      value={isRunning ? metrics.focus      : 0} color="#4f46e5" />
            <MetricBar label="Relaxation" value={isRunning ? metrics.relaxation : 0} color="#059669" />
          </div>

          {/* Calibrating notice */}
          {calibrating && (
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

      {/* Ambient audio */}
      <iframe
        src="https://www.youtube.com/embed/JbJ0sYt9Nyk?autoplay=1&loop=1&playlist=JbJ0sYt9Nyk&controls=0"
        style={{ position: 'absolute', width: 0, height: 0, border: 'none', opacity: 0, pointerEvents: 'none' }}
        allow="autoplay; encrypted-media"
        title="ambient-audio"
      />

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
