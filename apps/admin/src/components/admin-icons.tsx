import type { SVGProps } from 'react'

export type AdminIconName =
  | 'overview'
  | 'support'
  | 'clinics'
  | 'review'
  | 'food'
  | 'recipe'
  | 'billing'
  | 'system'
  | 'audit'
  | 'team'
  | 'chevron'

type IconProps = SVGProps<SVGSVGElement> & { name: AdminIconName }

export function AdminIcon({ name, ...props }: IconProps) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} {...common}>
      {name === 'overview' ? <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><path d="M15 17h4.5M17.25 14.75v4.5" /></> : null}
      {name === 'support' ? <><path d="M5.5 17.5 3.8 21l4.1-1.6h7.6a4.5 4.5 0 0 0 4.5-4.5v-5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 9.9v3.2" /><path d="M8 12h8M8 15h5" /></> : null}
      {name === 'clinics' ? <><path d="M4 20.5h16M5.5 20.5v-13h8v13M8 10.5h3M8 14h3M15.5 20.5v-8h3v8M16.5 15h1" /><path d="M7.5 7.5V4.8h4V7.5" /></> : null}
      {name === 'review' ? <><path d="M6 3.8h9.5l3 3V20.2H6z" /><path d="M15.5 3.8v3h3M9 12h6M9 15.5h4" /><path d="m8.4 9.2.9.9 1.7-1.9" /></> : null}
      {name === 'food' ? <><path d="M12 20.5c4.8-2.3 7.3-5.5 7.3-9.5-4.1.1-6.7 1.5-7.8 4.1C10.5 11.5 7.8 10.1 3.8 10c0 4.6 2.8 8.2 8.2 10.5Z" /><path d="M12 20.5v-8.8M12 15.4c1.7-1.6 3.7-2.6 6-3" /></> : null}
      {name === 'recipe' ? <><path d="M7 3.8h10v16.4H7z" /><path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" /><path d="M5 7.5V20h10" /></> : null}
      {name === 'billing' ? <><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><path d="M3.5 9h17M7.5 14.5h3" /></> : null}
      {name === 'system' ? <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" /></> : null}
      {name === 'audit' ? <><path d="M6 4.5h12v15H6z" /><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" /></> : null}
      {name === 'team' ? <><circle cx="9" cy="8" r="2.7" /><path d="M3.8 19.8c.6-3.3 2.4-5 5.2-5s4.6 1.7 5.2 5" /><path d="M15.5 6.2a2.5 2.5 0 0 1 0 4.8M16 14.8c2.2.2 3.7 1.8 4.2 4.5" /></> : null}
      {name === 'chevron' ? <path d="m9 5 7 7-7 7" /> : null}
    </svg>
  )
}
