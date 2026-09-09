'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({
  children = 'Kaydet',
  pending = 'Kaydediliyor…',
  className = 'button',
}: {
  children?: React.ReactNode
  pending?: string
  className?: string
}) {
  const status = useFormStatus()
  return (
    <button className={className} disabled={status.pending}>
      {status.pending ? pending : children}
    </button>
  )
}
