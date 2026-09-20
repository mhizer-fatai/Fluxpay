export function QrCode({ className = 'qr' }: { className?: string }) {
  const size = 25
  const cells = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const finder = (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9)
      if (finder) continue
      if ((x * 3 + y * 5 + ((x * y) % 7)) % 3 === 0) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
  }
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} aria-label="QR code" role="img">
      <g fill="#111">{cells}</g>
      {[[0, 0], [size - 8, 0], [0, size - 8]].map(([fx, fy]) => (
        <g key={`${fx}-${fy}`}>
          <rect x={fx} y={fy} width="8" height="8" fill="#111" />
          <rect x={fx + 1} y={fy + 1} width="6" height="6" fill="#fff" />
          <rect x={fx + 2} y={fy + 2} width="4" height="4" fill="#111" />
        </g>
      ))}
    </svg>
  )
}
