import Link from 'next/link'

export function FoodOperationsNav({ active }: { active: '/besinler' | '/tarifler' }) {
  return (
    <nav className="tabs" aria-label="Besin veritabanı">
      <Link className={active === '/besinler' ? 'active' : ''} href="/besinler">
        Besinler
      </Link>
      <Link className={active === '/tarifler' ? 'active' : ''} href="/tarifler">
        Tarifler
      </Link>
    </nav>
  )
}
