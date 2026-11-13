import { identiconCells } from '../lib/identicon'

export function Identicon({ address, size = 20 }: { address: string; size?: number }) {
  return (
    <svg className="identicon" width={size} height={size} viewBox="0 0 5 5" aria-hidden="true" shapeRendering="crispEdges">
      <rect width="5" height="5" fill="#131C30" />
      {identiconCells(address).map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="1" height="1" fill={c.color} />
      ))}
    </svg>
  )
}
