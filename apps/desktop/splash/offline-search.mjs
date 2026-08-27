export const OFFLINE_SEARCH_LIMIT = 12

const PAGE_ENTRIES = [
  {
    id: 'page-panel',
    kind: 'page',
    label: 'Panel',
    description: 'Klinik özeti ve yaklaşan randevular',
    targetPage: 'panel',
    keywords: 'ana sayfa dashboard özet yaklaşan randevular',
  },
  {
    id: 'page-clients',
    kind: 'page',
    label: 'Danışanlar',
    description: 'Danışan kayıtları ve sağlık bilgileri',
    targetPage: 'clients',
    keywords: 'hasta kişi profil ölçüm anamnez tahlil ödeme',
  },
  {
    id: 'page-appointments',
    kind: 'page',
    label: 'Randevular',
    description: 'Cihazdaki randevu kayıtları',
    targetPage: 'appointments',
    keywords: 'takvim görüşme kontrol tarih saat',
  },
  {
    id: 'page-plans',
    kind: 'page',
    label: 'Planlar',
    description: 'Beslenme planları ve taslaklar',
    targetPage: 'plans',
    keywords: 'diyet beslenme kalori öğün taslak',
  },
  {
    id: 'page-settings',
    kind: 'page',
    label: 'Ayarlar',
    description: 'PIN ve cihaz oturumu ayarları',
    targetPage: 'settings',
    keywords: 'pin güvenlik kilit hesap',
  },
]

export function normalizeOfflineSearchText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function clientName(clientsById, clientId) {
  const client = clientsById.get(clientId)
  return client ? `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() : 'Danışan'
}

function searchableResult(result, keywords = '') {
  return {
    ...result,
    normalizedLabel: normalizeOfflineSearchText(result.label),
    normalizedSearchText: normalizeOfflineSearchText(
      `${result.label} ${result.description ?? ''} ${keywords}`,
    ),
  }
}

function rankResult(result, query) {
  if (result.normalizedLabel === query) return 0
  if (result.normalizedLabel.startsWith(query)) return 1
  if (result.normalizedLabel.includes(query)) return 2
  return 3
}

export function buildOfflineSearchResults(workspace, query, limit = OFFLINE_SEARCH_LIMIT) {
  const normalizedQuery = normalizeOfflineSearchText(query)
  const clients = Array.isArray(workspace?.clients) ? workspace.clients : []
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  const results = PAGE_ENTRIES.map((page) => searchableResult(page, page.keywords))

  if (!normalizedQuery) {
    return results.map(
      ({
        normalizedLabel: _normalizedLabel,
        normalizedSearchText: _searchText,
        keywords: _keywords,
        ...result
      }) => result,
    )
  }

  for (const client of clients) {
    const label = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || 'Adsız danışan'
    results.push(
      searchableResult(
        {
          id: `client-${client.id}`,
          kind: 'client',
          label,
          description: [client.phone, client.email, client.status].filter(Boolean).join(' · '),
          recordId: client.id,
          targetPage: 'client-detail',
        },
        `${client.notes ?? ''} ${client.occupation ?? ''} ${client.referralSource ?? ''}`,
      ),
    )
  }

  for (const plan of Array.isArray(workspace?.plans) ? workspace.plans : []) {
    const ownerName = clientName(clientsById, plan.clientId)
    results.push(
      searchableResult(
        {
          id: `plan-${plan.id}`,
          kind: 'plan',
          label: plan.name || 'Adsız plan',
          description: `${ownerName} · ${plan.status || 'taslak'}`,
          recordId: plan.id,
          targetPage: 'plans',
        },
        `${ownerName} ${plan.notes ?? ''} ${plan.targetKcal ?? ''}`,
      ),
    )
  }

  for (const appointment of Array.isArray(workspace?.appointments) ? workspace.appointments : []) {
    const ownerName = clientName(clientsById, appointment.clientId)
    results.push(
      searchableResult(
        {
          id: `appointment-${appointment.id}`,
          kind: 'appointment',
          label: ownerName,
          description: `${appointment.type || 'Görüşme'} · ${appointment.startsAt || ''}`,
          recordId: appointment.id,
          targetPage: 'appointments',
        },
        `${appointment.notes ?? ''} ${appointment.location ?? ''}`,
      ),
    )
  }

  return results
    .filter((result) => !normalizedQuery || result.normalizedSearchText.includes(normalizedQuery))
    .sort((left, right) => {
      const rankDifference = rankResult(left, normalizedQuery) - rankResult(right, normalizedQuery)
      if (rankDifference !== 0) return rankDifference
      return left.label.localeCompare(right.label, 'tr-TR')
    })
    .slice(0, Math.max(0, limit))
    .map(
      ({
        normalizedLabel: _normalizedLabel,
        normalizedSearchText: _searchText,
        keywords: _keywords,
        ...result
      }) => result,
    )
}
