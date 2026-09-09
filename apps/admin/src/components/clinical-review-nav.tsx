import Link from 'next/link'

const links = [
  ['/clinical-inceleme', 'Genel Bakış'],
  ['/clinical-inceleme/hakemler', 'Hakemler'],
  ['/clinical-inceleme/davetler', 'Davetler'],
  ['/clinical-inceleme/gorevler', 'Görevler'],
] as const

export function ClinicalReviewNav({ active }: { active: string }) {
  return (
    <nav className="tabs" aria-label="Clinical Review yönetimi">
      {links.map(([href, label]) => (
        <Link className={active === href ? 'active' : ''} href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
