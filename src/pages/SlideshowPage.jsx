import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Slide1Welcome from '../slides/Slide1Welcome'
import Slide2Privacy from '../slides/Slide2Privacy'
import Slide3Instructions from '../slides/Slide3Instructions'
import Slide4Meditation from '../slides/Slide4Meditation'

const SLIDES = [
  { id: 1, component: Slide1Welcome },
  { id: 2, component: Slide2Privacy },
  { id: 3, component: Slide3Instructions },
  { id: 4, component: Slide4Meditation },
]

const TOTAL = SLIDES.length

export default function SlideshowPage() {
  const [current, setCurrent] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [direction, setDirection] = useState(1)

  const goTo = useCallback((idx) => {
    if (transitioning || idx === current) return
    if (idx < 0 || idx >= TOTAL) return
    setDirection(idx > current ? 1 : -1)
    setTransitioning(true)
    setTimeout(() => {
      setCurrent(idx)
      setTransitioning(false)
    }, 380)
  }, [current, transitioning])

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [next, prev])

  const CurrentSlide = SLIDES[current].component
  const isLight = current === 3

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none"
      style={{ background: '#080e18' }}>

      {/* Slide with crossfade + subtle drift */}
      <div
        className="absolute inset-0"
        style={{
          opacity: transitioning ? 0 : 1,
          transform: transitioning
            ? `translateX(${direction * 28}px) scale(0.985)`
            : 'translateX(0) scale(1)',
          transition: 'opacity 0.38s cubic-bezier(0.4,0,0.2,1), transform 0.38s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <CurrentSlide />
      </div>

      {/* ── Top-right: Data button + counter ── */}
      <div className="absolute top-5 right-6 z-50 flex items-center gap-5">

        {/* Large rectangle EEG Data button */}
        <Link
          to="/data"
          className="flex items-center gap-3"
          style={{
            padding: '14px 28px',
            borderRadius: '12px',
            background: isLight
              ? 'rgba(255,255,255,0.82)'
              : 'rgba(70,115,255,0.22)',
            backdropFilter: 'blur(16px)',
            border: isLight
              ? '1.5px solid rgba(90,130,210,0.45)'
              : '1.5px solid rgba(130,175,255,0.5)',
            boxShadow: isLight
              ? '0 4px 20px rgba(70,110,200,0.18)'
              : '0 4px 24px rgba(70,110,255,0.32)',
            transition: 'all 0.25s ease',
            textDecoration: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = isLight ? 'rgba(255,255,255,0.96)' : 'rgba(80,130,255,0.34)'
            e.currentTarget.style.boxShadow = isLight ? '0 6px 28px rgba(70,110,200,0.28)' : '0 6px 32px rgba(70,110,255,0.48)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = isLight ? 'rgba(255,255,255,0.82)' : 'rgba(70,115,255,0.22)'
            e.currentTarget.style.boxShadow = isLight ? '0 4px 20px rgba(70,110,200,0.18)' : '0 4px 24px rgba(70,110,255,0.32)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          {/* Wave icon */}
          <svg width="22" height="14" viewBox="0 0 36 18" fill="none"
            style={{ color: isLight ? '#4a6fbe' : 'rgba(190,215,255,0.95)', flexShrink: 0 }}>
            <path d="M2 9 Q6 2 11 9 Q16 16 21 9 Q26 2 31 9 Q33 12 35 9"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>
          <span className="font-sans font-semibold tracking-[0.1em] uppercase"
            style={{ fontSize: '13px', color: isLight ? '#3a5fa0' : 'rgba(215,230,255,0.97)' }}>
            EEG Data
          </span>
        </Link>

        {/* Slide counter */}
        <span className="font-sans text-sm tabular-nums tracking-widest font-light"
          style={{ color: isLight ? 'rgba(70,90,120,0.55)' : 'rgba(255,255,255,0.38)' }}>
          {current + 1}&thinsp;/&thinsp;{TOTAL}
        </span>
      </div>

      {/* ── Prev arrow ── */}
      {current > 0 && (
        <button
          onClick={prev}
          className="absolute left-5 top-1/2 -translate-y-1/2 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
          style={{
            background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(8px)',
            border: isLight ? '1px solid rgba(150,180,220,0.4)' : '1px solid rgba(255,255,255,0.1)',
            color: isLight ? '#4a6690' : 'rgba(255,255,255,0.55)',
          }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* ── Next arrow ── */}
      {current < TOTAL - 1 && (
        <button
          onClick={next}
          className="absolute right-5 top-1/2 -translate-y-1/2 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
          style={{
            background: isLight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(8px)',
            border: isLight ? '1px solid rgba(150,180,220,0.4)' : '1px solid rgba(255,255,255,0.1)',
            color: isLight ? '#4a6690' : 'rgba(255,255,255,0.55)',
          }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── Dot progress ── */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              width: i === current ? '22px' : '6px',
              height: '6px',
              borderRadius: '3px',
              background: i === current
                ? isLight ? 'rgba(80,110,170,0.65)' : 'rgba(255,255,255,0.65)'
                : isLight ? 'rgba(80,110,170,0.2)' : 'rgba(255,255,255,0.18)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
