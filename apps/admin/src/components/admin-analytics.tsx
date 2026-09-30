import Link from 'next/link'

type MonthlyPoint = { label: string; clinics: number; users: number; clients: number; tickets: number }
type ChartSeries = { key: keyof Omit<MonthlyPoint, 'label'>; label: string; color: string }

function makePoints(values: number[], width: number, height: number, max: number) {
  const insetX = 18
  const insetY = 17
  const usableWidth = width - insetX * 2
  const usableHeight = height - insetY * 2
  return values.map((value, index) => {
    const x = insetX + (usableWidth / Math.max(values.length - 1, 1)) * index
    const y = height - insetY - (value / max) * usableHeight
    return `${x},${y}`
  }).join(' ')
}

export function TrendChart({ title, description, data, series }: { title: string; description: string; data: MonthlyPoint[]; series: ChartSeries[] }) {
  const max = Math.max(1, ...data.flatMap((point) => series.map((item) => point[item.key])))
  const width = 640
  const height = 190
  return <section className="analytics-card"><div className="analytics-card-head"><div><h2>{title}</h2><p>{description}</p></div><div className="chart-legend" aria-label="Grafik açıklaması">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div></div><div className="trend-chart-wrap"><svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: son altı aya ait veri`}>{[.25, .5, .75].map((line) => <line key={line} x1="18" x2={width - 18} y1={height - 17 - (height - 34) * line} y2={height - 17 - (height - 34) * line} />)}{series.map((item) => <polyline key={item.key} points={makePoints(data.map((point) => point[item.key]), width, height, max)} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}{series.flatMap((item) => data.map((point, index) => { const x = 18 + ((width - 36) / Math.max(data.length - 1, 1)) * index; const y = height - 17 - (point[item.key] / max) * (height - 34); return <circle key={`${item.key}-${point.label}`} cx={x} cy={y} r="3.25" fill="white" stroke={item.color} strokeWidth="2" /> }))}</svg><div className="chart-labels" aria-hidden="true">{data.map((point) => <span key={point.label}>{point.label}</span>)}</div></div><table className="sr-only"><caption>{title}</caption><thead><tr><th>Ay</th>{series.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{data.map((point) => <tr key={point.label}><th>{point.label}</th>{series.map((item) => <td key={item.key}>{point[item.key]}</td>)}</tr>)}</tbody></table></section>
}

export function Delta({ current, previous }: { current: number; previous: number }) {
  const difference = current - previous
  const className = difference > 0 ? 'is-positive' : difference < 0 ? 'is-negative' : 'is-neutral'
  return <span className={`metric-delta ${className}`}>{difference > 0 ? `+${difference}` : difference} <span>önceki 30 güne göre</span></span>
}

export function Distribution({ title, description, items }: { title: string; description: string; items: Array<{ label: string; value: number; href?: string; tone?: 'green' | 'amber' | 'red' | 'blue' }> }) {
  const max = Math.max(1, ...items.map((item) => item.value))
  return <section className="analytics-card distribution-card"><div className="analytics-card-head"><div><h2>{title}</h2><p>{description}</p></div></div><div className="distribution-list">{items.map((item) => { const content = <><span className="distribution-label">{item.label}</span><span className="distribution-track"><i className={`tone-${item.tone ?? 'green'}`} style={{ width: `${(item.value / max) * 100}%` }} /></span><strong>{item.value}</strong></>; return item.href ? <Link className="distribution-row" href={item.href} key={item.label}>{content}</Link> : <div className="distribution-row" key={item.label}>{content}</div> })}</div></section>
}

export function AttentionList({ items }: { items: Array<{ label: string; detail: string; value: number; href: string; tone?: 'green' | 'amber' | 'red' }> }) {
  return <section className="analytics-card attention-card"><div className="analytics-card-head"><div><h2>Operasyon odağı</h2><p>Şu anda müdahale veya takip gerektiren gerçek kayıtlar.</p></div></div><div className="attention-list">{items.map((item) => <Link href={item.href} className="attention-row" key={item.label}><span className={`attention-marker tone-${item.tone ?? 'green'}`} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{item.value}</b><span aria-hidden="true">→</span></Link>)}</div></section>
}

export function RecentActivity({ rows }: { rows: Array<{ id: string; action: string; entityType: string; actorName: string | null; outcome: string; createdAt: Date }> }) {
  const date = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
  return <section className="analytics-card activity-card"><div className="analytics-card-head"><div><h2>Son denetim hareketleri</h2><p>Platform yönetimi tarafından kaydedilen en son işlemler.</p></div><Link className="text-link" href="/denetim">Tüm kayıtlar</Link></div>{rows.length ? <ol className="activity-list">{rows.map((row) => <li key={row.id}><span className={`activity-outcome ${row.outcome === 'success' ? 'is-success' : 'is-failure'}`} /><span><strong>{row.action}</strong><small>{row.actorName ?? 'Sistem'} · {row.entityType}</small></span><time dateTime={row.createdAt.toISOString()}>{date.format(row.createdAt)}</time></li>)}</ol> : <p className="empty-copy">Henüz görüntülenecek denetim kaydı yok.</p>}</section>
}
