import { useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// ── Shared constants ─────────────────────────────────────────────────────────
const METRIC_COLORS  = { stress: '#dc2626', focus: '#4f46e5', relaxation: '#059669' }
const HIGH_THRESHOLD = 65
const LOW_THRESHOLD  = 35
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ── Fake session (used when no real session data is passed) ──────────────────
// Simulates a meditation arc: stress falls, relaxation builds over 5 minutes
function generateFakeSession() {
  const DURATION = 300
  const history  = []
  for (let i = 0; i < DURATION; i++) {
    const phase = i / DURATION // 0 → 1
    history.push({
      t:          i,
      stress:     clamp(60 - 25 * phase + 14 * Math.sin(i * 0.04)        + 5 * (Math.random() - 0.5), 0, 100),
      focus:      clamp(44 + 20 * phase + 12 * Math.cos(i * 0.03 + 0.5)  + 4 * (Math.random() - 0.5), 0, 100),
      relaxation: clamp(48 + 26 * phase + 10 * Math.sin(i * 0.025 + 1.2) + 4 * (Math.random() - 0.5), 0, 100),
    })
  }
  return {
    history,
    elapsed:   DURATION,
    startTime: new Date(Date.now() - DURATION * 1000).toISOString(),
  }
}

// ── Stats ────────────────────────────────────────────────────────────────────
function computeStats(history) {
  if (!history.length) return null
  const keys   = ['stress', 'focus', 'relaxation']
  const result = {}

  keys.forEach(key => {
    const vals = history.map(h => h[key])
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length
    const max  = Math.max(...vals)
    const min  = Math.min(...vals)
    const maxT = history[vals.indexOf(max)].t
    const minT = history[vals.indexOf(min)].t
    const highPct = vals.filter(v => v >= HIGH_THRESHOLD).length / vals.length * 100
    const lowPct  = vals.filter(v => v <= LOW_THRESHOLD).length  / vals.length * 100
    result[key] = { mean, max, min, maxT, minT, highPct, lowPct, midPct: 100 - highPct - lowPct }
  })

  // Start vs end — first and last 20% of session (min 20 pts)
  const win   = Math.max(20, Math.floor(history.length * 0.2))
  const first = history.slice(0, win)
  const last  = history.slice(-win)
  const avg   = (arr, key) => arr.reduce((a, h) => a + h[key], 0) / arr.length
  result.startVsEnd = {}
  keys.forEach(key => {
    result.startVsEnd[key] = { start: avg(first, key), end: avg(last, key) }
  })

  return result
}

function generateTakeaway(stats) {
  const { stress, focus, relaxation, startVsEnd } = stats
  const parts = []

  if      (relaxation.mean > 65 && stress.mean < 45) parts.push('You settled into a deep, calm state')
  else if (relaxation.mean > 55)                       parts.push('The session was predominantly relaxing')
  else if (focus.mean > 60)                            parts.push('You maintained strong mental engagement')
  else                                                  parts.push('Your mind stayed active throughout')

  const stressDrop = startVsEnd.stress.start - startVsEnd.stress.end
  const relaxGain  = startVsEnd.relaxation.end - startVsEnd.relaxation.start
  if      (stressDrop > 15) parts.push(`stress fell ${Math.round(stressDrop)} points from start to finish`)
  else if (relaxGain  > 15) parts.push(`relaxation built by ${Math.round(relaxGain)} points over the session`)

  if      (focus.min < 35 && focus.minT > 60)   parts.push(`with a focus dip around ${formatTime(focus.minT)}`)
  else if (relaxation.max > 80)                  parts.push(`peaking in calm at ${formatTime(relaxation.maxT)}`)
  else if (stress.max > 75 && stress.maxT > 30) parts.push(`with a stress spike at ${formatTime(stress.maxT)}`)

  return parts.join(', ') + '.'
}

function formatTime(seconds) {
  const m   = Math.floor(seconds / 60).toString().padStart(2, '0')
  const sec = (Math.round(seconds) % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ── Session timeline chart ───────────────────────────────────────────────────
function TimelineChart({ history }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !history.length) return
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')

    const PAD_L = 38, PAD_R = 18, PAD_T = 14, PAD_B = 30
    const cW = W - PAD_L - PAD_R, cH = H - PAD_T - PAD_B
    const dur = history[history.length - 1].t || history.length

    ctx.clearRect(0, 0, W, H)

    // Y gridlines + labels
    ;[0, 25, 50, 75, 100].forEach(pct => {
      const y = PAD_T + cH * (1 - pct / 100)
      ctx.strokeStyle = pct === 50 ? 'rgba(0,30,90,0.1)' : 'rgba(0,30,90,0.05)'
      ctx.lineWidth = 1; ctx.setLineDash(pct === 0 || pct === 100 ? [] : [3, 6])
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + cW, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(15,30,65,0.32)'; ctx.font = '9px system-ui'
      ctx.textAlign = 'right'; ctx.fillText(`${pct}`, PAD_L - 7, y + 3)
    })

    // X axis — minute marks
    const totalMins = Math.ceil(dur / 60)
    for (let m = 0; m <= totalMins; m++) {
      const x = PAD_L + (m * 60 / dur) * cW
      if (x > PAD_L + cW + 1) break
      ctx.strokeStyle = 'rgba(0,30,90,0.06)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + cH); ctx.stroke()
      ctx.fillStyle = 'rgba(15,30,65,0.32)'; ctx.font = '9px system-ui'
      ctx.textAlign = 'center'; ctx.fillText(`${m}m`, x, H - 7)
    }

    // Lines
    Object.entries(METRIC_COLORS).forEach(([key, color]) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2
      ctx.shadowColor = color; ctx.shadowBlur = 4
      history.forEach((pt, i) => {
        const x = PAD_L + (pt.t / dur) * cW
        const y = PAD_T + cH * (1 - pt[key] / 100)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
    })
    ctx.shadowBlur = 0
  }, [history])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, peak, peakTime }) {
  return (
    <div style={{ flex: 1, padding: '18px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(70,130,200,0.12)', boxShadow: '0 1px 10px rgba(60,100,180,0.06)' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)', marginBottom: 10 }}>
        Avg {label}
      </div>
      <div style={{ fontSize: 42, fontWeight: 300, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 8 }}>
        {Math.round(value)}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(15,30,65,0.32)' }}>
        Peak {Math.round(peak)} at {formatTime(peakTime)}
      </div>
    </div>
  )
}

// ── Time-in-state stacked bar ────────────────────────────────────────────────
function TimeInStateBar({ label, highPct, midPct, lowPct, color }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 10, textTransform: 'capitalize', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}>{label}</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)' }}>
          {Math.round(highPct)}% high · {Math.round(midPct)}% mid · {Math.round(lowPct)}% low
        </span>
      </div>
      <div style={{ display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
        <div style={{ width: `${highPct}%`, background: color, opacity: 0.85, borderRadius: '5px 0 0 5px', transition: 'width 0.6s' }} />
        <div style={{ width: `${midPct}%`, background: color, opacity: 0.3, transition: 'width 0.6s' }} />
        <div style={{ width: `${lowPct}%`, background: 'rgba(255,255,255,0.08)', borderRadius: '0 5px 5px 0', transition: 'width 0.6s' }} />
      </div>
    </div>
  )
}

// ── Export helpers ───────────────────────────────────────────────────────────
function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click(); URL.revokeObjectURL(url)
}

function exportJSON(history, elapsed, startTime) {
  downloadBlob(
    JSON.stringify({ startTime, durationSeconds: elapsed, data: history }, null, 2),
    `meditation-${Date.now()}.json`, 'application/json'
  )
}

function exportCSV(history) {
  const rows = ['t,stress,focus,relaxation',
    ...history.map(h => `${h.t},${h.stress.toFixed(1)},${h.focus.toFixed(1)},${h.relaxation.toFixed(1)}`)]
  downloadBlob(rows.join('\n'), `meditation-${Date.now()}.csv`, 'text/csv')
}

// ── SummaryPage ──────────────────────────────────────────────────────────────
export default function SummaryPage() {
  const location = useLocation()
  const navigate = useNavigate()

  // Use real session data if navigated with state, otherwise show fake preview
  const { history, elapsed, startTime } = useMemo(
    () => (location.state?.history?.length ? location.state : generateFakeSession()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const stats    = useMemo(() => computeStats(history), [history])
  const takeaway = useMemo(() => stats ? generateTakeaway(stats) : '', [stats])

  if (!stats) return null

  const sessionDate = new Date(startTime || Date.now())
  const dateStr     = sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr     = sessionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const btnBase  = { fontSize: 12, padding: '8px 18px', borderRadius: 10, cursor: 'pointer', letterSpacing: '0.04em' }
  const btnGhost = { ...btnBase, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(70,130,200,0.2)', color: 'rgba(15,30,65,0.5)' }
  const btnGreen = { ...btnBase, fontWeight: 500, background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.3)', color: '#065f46' }

  return (
    <div style={{ height: '100vh', background: 'linear-gradient(150deg,#eaf3fc 0%,#dce8f7 55%,#e5eef8 100%)', color: '#0f1e3d', fontFamily: "'Outfit', system-ui, sans-serif", overflowY: 'auto' }}>

      {/* ── Sticky header ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 28px', borderBottom: '1px solid rgba(70,130,200,0.15)', background: 'rgba(234,243,252,0.97)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/data')} style={{ ...btnGhost, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            EEG Monitor
          </button>
          <div style={{ width: 1, height: 18, background: 'rgba(70,130,200,0.2)' }} />
          <span style={{ fontSize: 17, fontWeight: 300, color: 'rgba(15,30,65,0.88)', fontFamily: 'Georgia, serif' }}>Session Summary</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => exportCSV(history)}                       style={btnGhost}>Export CSV</button>
          <button onClick={() => exportJSON(history, elapsed, startTime)}  style={btnGhost}>Export JSON</button>
          <button onClick={() => navigate('/data')}                        style={btnGreen}>▶ New Session</button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '36px 28px 72px' }}>

        {/* ── Session info + takeaway ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'rgba(15,30,65,0.45)', letterSpacing: '0.05em' }}>{dateStr} · {timeStr}</span>
            <span style={{ fontSize: 12, color: 'rgba(15,30,65,0.28)', letterSpacing: '0.04em' }}>Duration {formatTime(elapsed)}</span>
            {!location.state?.history?.length && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(161,120,0,0.22)', color: '#7a5200', letterSpacing: '0.08em' }}>PREVIEW — simulated session</span>
            )}
          </div>
          <p style={{ fontSize: 21, fontWeight: 300, color: 'rgba(15,30,65,0.72)', lineHeight: 1.5, maxWidth: 620, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
            "{takeaway}"
          </p>
        </div>

        {/* ── Average score cards ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          <StatCard label="Stress"     value={stats.stress.mean}     color={METRIC_COLORS.stress}     peak={stats.stress.max}     peakTime={stats.stress.maxT} />
          <StatCard label="Focus"      value={stats.focus.mean}      color={METRIC_COLORS.focus}      peak={stats.focus.max}      peakTime={stats.focus.maxT} />
          <StatCard label="Relaxation" value={stats.relaxation.mean} color={METRIC_COLORS.relaxation} peak={stats.relaxation.max} peakTime={stats.relaxation.maxT} />
        </div>

        {/* ── Session timeline (centerpiece) ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)' }}>Session Timeline</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(70,130,200,0.15)' }} />
            {Object.entries(METRIC_COLORS).map(([key, color]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 2.5, background: color, borderRadius: 2, display: 'inline-block' }} />
                <span style={{ fontSize: 9, color: 'rgba(15,30,65,0.4)', textTransform: 'capitalize' }}>{key}</span>
              </div>
            ))}
          </div>
          <div style={{ height: 260, borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(70,130,200,0.13)', boxShadow: '0 2px 16px rgba(60,100,180,0.08)' }}>
            <TimelineChart history={history} />
          </div>
        </div>

        {/* ── Bottom two columns ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>

          {/* Key moments */}
          <div style={{ padding: '22px 24px', borderRadius: 14, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(70,130,200,0.12)', boxShadow: '0 1px 10px rgba(60,100,180,0.06)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)', marginBottom: 18 }}>Key Moments</div>
            {Object.entries(METRIC_COLORS).map(([key, color]) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, textTransform: 'capitalize', letterSpacing: '0.15em', color: 'rgba(15,30,65,0.35)', marginBottom: 5 }}>{key}</div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <span style={{ fontSize: 12, color }}>
                    ↑ Peak <strong>{Math.round(stats[key].max)}</strong> at {formatTime(stats[key].maxT)}
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(15,30,65,0.35)' }}>
                    ↓ Low <strong style={{ color: 'rgba(15,30,65,0.55)' }}>{Math.round(stats[key].min)}</strong> at {formatTime(stats[key].minT)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Time in state */}
          <div style={{ padding: '22px 24px', borderRadius: 14, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(70,130,200,0.12)', boxShadow: '0 1px 10px rgba(60,100,180,0.06)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)', marginBottom: 18 }}>Time in State</div>
            {Object.entries(METRIC_COLORS).map(([key, color]) => (
              <TimeInStateBar key={key} label={key} color={color} highPct={stats[key].highPct} midPct={stats[key].midPct} lowPct={stats[key].lowPct} />
            ))}
            <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
              {[['High (≥65)', 'rgba(15,30,65,0.5)'], ['Mid', 'rgba(15,30,65,0.2)'], ['Low (≤35)', 'rgba(15,30,65,0.1)']].map(([label, bg]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: bg }} />
                  <span style={{ fontSize: 9, color: 'rgba(15,30,65,0.35)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Start vs end ── */}
        <div style={{ padding: '22px 24px', borderRadius: 14, background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(70,130,200,0.12)', boxShadow: '0 1px 10px rgba(60,100,180,0.06)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(15,30,65,0.38)', marginBottom: 18 }}>
            Start vs. End <span style={{ fontSize: 9, textTransform: 'none', letterSpacing: 0, color: 'rgba(15,30,65,0.25)' }}>(first vs. last 20% of session)</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {Object.entries(METRIC_COLORS).map(([key, color]) => {
              const { start, end } = stats.startVsEnd[key]
              const delta    = end - start
              const improved = key === 'stress' ? delta < 0 : delta > 0
              const deltaAbs = Math.abs(Math.round(delta))
              return (
                <div key={key} style={{ flex: 1, padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.6)', border: `1px solid ${color}44` }}>
                  <div style={{ fontSize: 9, textTransform: 'capitalize', letterSpacing: '0.15em', color: 'rgba(15,30,65,0.38)', marginBottom: 12 }}>{key}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(15,30,65,0.3)', marginBottom: 2 }}>Start</div>
                      <div style={{ fontSize: 26, fontWeight: 300, color: 'rgba(15,30,65,0.45)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(start)}</div>
                    </div>
                    <div style={{ fontSize: 18, color: 'rgba(15,30,65,0.2)', paddingTop: 14 }}>→</div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(15,30,65,0.3)', marginBottom: 2 }}>End</div>
                      <div style={{ fontSize: 26, fontWeight: 300, color, fontVariantNumeric: 'tabular-nums' }}>{Math.round(end)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: improved ? '#059669' : '#dc2626' }}>
                    {delta > 0 ? '↑' : '↓'} {deltaAbs} pts {improved ? '✓' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
