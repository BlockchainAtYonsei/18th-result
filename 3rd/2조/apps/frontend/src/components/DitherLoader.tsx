// Waiting mark: an ordered (Bayer 4×4) dither of a gradient that drifts while a real wait holds.
// Only used while waiting; reduced motion shows one still frame (design doc §10).
import { useEffect, useRef } from 'react'

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const ON = '#129AF0'
const MID = '#0A61E7'
const OFF = '#131C30'

export function DitherLoader({ label, width = 120, height = 12 }: { label: string; width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const cell = 2
    const cols = Math.floor(width / cell)
    const rows = Math.floor(height / cell)
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const draw = () => {
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          // a soft band that travels left to right
          const pos = (x / cols - (frame % 48) / 48 + 1) % 1
          const level = Math.max(0, Math.cos((pos - 0.5) * Math.PI * 2)) ** 1.4
          const threshold = BAYER[(y % 4) * 4 + (x % 4)]
          ctx.fillStyle = level > threshold ? (level > 0.75 ? ON : MID) : OFF
          ctx.fillRect(x * cell, y * cell, cell, cell)
        }
      frame += 1
    }
    draw()
    if (reduce) return
    const timer = setInterval(draw, 1000 / 12)
    return () => clearInterval(timer)
  }, [width, height])

  return (
    <span className="dither" role="status" aria-live="polite">
      <canvas ref={ref} width={width} height={height} aria-hidden="true" />
      <span className="caption t2">{label}</span>
    </span>
  )
}
