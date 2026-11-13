// Deterministic 5×5 mirrored picture per address, so wallets are easy to tell apart at a glance.
const COLORS = ['#129AF0', '#0A61E7', '#8FB0DC', '#E6F1FD', '#08428B', '#5B7FB5']

function hash(s: string): number {
  let h = 2166136261
  for (const c of s) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 5×5 mirrored cells; returns the cell list so it can render in HTML or inside an SVG. */
export function identiconCells(address: string): { x: number; y: number; color: string }[] {
  let h = hash(address)
  const fg = COLORS[h % COLORS.length]
  const fg2 = COLORS[(h >>> 5) % COLORS.length]
  const cells: { x: number; y: number; color: string }[] = []
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0
      if (h % 2) {
        const color = (h >>> 3) % 3 === 0 ? fg2 : fg
        cells.push({ x, y, color })
        if (x < 2) cells.push({ x: 4 - x, y, color })
      }
    }
  return cells
}
