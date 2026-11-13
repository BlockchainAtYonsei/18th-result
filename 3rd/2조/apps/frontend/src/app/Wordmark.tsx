export function WordmarkGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <rect x="2" y="3" width="18" height="4" rx="1" fill="#E6F1FD" />
      <rect x="2" y="9" width="13" height="4" rx="1" fill="#129AF0" />
      <rect x="2" y="15" width="8" height="4" rx="1" fill="#0A61E7" />
    </svg>
  )
}
