import { useEffect, useState } from 'react'
import QRCodeLib from 'qrcode'

/** Real QR code encoding of `value` (e.g. a wallet address or payment URL). */
export function QrCode({ value, size = 180, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let alive = true
    if (!value) return
    QRCodeLib.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then(data => { if (alive) setSrc(data) })
      .catch(() => {})
    return () => { alive = false }
  }, [value, size])

  if (!src) return <div className={className} style={{ width: size, height: size }} aria-busy="true" aria-label="Generating QR code" />
  return <img className={className} src={src} width={size} height={size} alt={`QR code for ${value}`} />
}
