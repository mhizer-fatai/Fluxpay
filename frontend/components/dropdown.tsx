import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function Dropdown({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  return (
    <div className="sn-dd">
      <button type="button" className="sn-dd-trigger" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{current?.label ?? value}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <>
          <button type="button" className="sn-dd-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="sn-dd-menu">
            {options.map(o => (
              <button type="button" key={o.value} className={`sn-dd-item${o.value === value ? ' is-active' : ''}`} onClick={() => { onChange(o.value); setOpen(false) }}>{o.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
