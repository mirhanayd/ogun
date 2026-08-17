import { describe, expect, it } from 'vitest'
import {
  buildNotificationFeed,
  isPackageExpiringSoon,
  isStaleMeasurementClient,
  packageExpiryState,
} from './summary'

const NOW = new Date('2026-08-17T12:00:00Z')

describe('isStaleMeasurementClient', () => {
  it('son ölçüm 14 günden eskiyse "eski" sayılır', () => {
    const client = {
      clientId: 'c1',
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      lastMeasuredAt: new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000),
    }
    expect(isStaleMeasurementClient(client, NOW)).toBe(true)
  })

  it('son ölçüm 14 günden yeniyse "eski" SAYILMAZ', () => {
    const client = {
      clientId: 'c1',
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      lastMeasuredAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
    }
    expect(isStaleMeasurementClient(client, NOW)).toBe(false)
  })

  it('hiç ölçüm yoksa VE danışan 14+ gündür kayıtlıysa "eski" sayılır', () => {
    const client = {
      clientId: 'c1',
      firstName: 'Mehmet',
      lastName: 'Demir',
      createdAt: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000),
      lastMeasuredAt: null,
    }
    expect(isStaleMeasurementClient(client, NOW)).toBe(true)
  })

  it('hiç ölçüm yoksa AMA danışan YENİ kayıtlıysa (yanlış pozitif önleme) "eski" SAYILMAZ', () => {
    const client = {
      clientId: 'c1',
      firstName: 'Mehmet',
      lastName: 'Demir',
      createdAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000),
      lastMeasuredAt: null,
    }
    expect(isStaleMeasurementClient(client, NOW)).toBe(false)
  })
})

describe('isPackageExpiringSoon / packageExpiryState', () => {
  it('7 gün içinde dolacak paket "yaklaşıyor" sayılır', () => {
    const expiresAt = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000)
    expect(isPackageExpiringSoon(expiresAt, NOW)).toBe(true)
    expect(packageExpiryState(expiresAt, NOW)).toBe('yaklaşıyor')
  })

  it('zaten süresi dolmuş paket de kapsam İÇİNDEDİR ve "süresi_doldu" durumundadır', () => {
    const expiresAt = new Date(NOW.getTime() - 24 * 60 * 60 * 1000)
    expect(isPackageExpiringSoon(expiresAt, NOW)).toBe(true)
    expect(packageExpiryState(expiresAt, NOW)).toBe('süresi_doldu')
  })

  it('8+ gün sonra dolacak paket henüz kapsam DIŞINDADIR', () => {
    const expiresAt = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000)
    expect(isPackageExpiringSoon(expiresAt, NOW)).toBe(false)
  })
})

describe('buildNotificationFeed', () => {
  it('ham veriyi doğru şekilde filtreleyip sayar', () => {
    const feed = buildNotificationFeed(
      {
        todayAppointmentsCount: 4,
        noShowClients: [
          { clientId: 'c1', clientFirstName: 'A', clientLastName: 'B', startsAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) },
        ],
        clientsWithLastMeasurement: [
          {
            clientId: 'c2',
            firstName: 'Eski',
            lastName: 'Ölçüm',
            createdAt: new Date('2025-01-01T00:00:00Z'),
            lastMeasuredAt: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000),
          },
          {
            clientId: 'c3',
            firstName: 'Güncel',
            lastName: 'Ölçüm',
            createdAt: new Date('2025-01-01T00:00:00Z'),
            lastMeasuredAt: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000),
          },
        ],
        expiringPackages: [
          {
            clientPackageId: 'p1',
            clientId: 'c4',
            clientFirstName: 'Paket',
            clientLastName: 'Sahibi',
            packageName: '10 Seans',
            expiresAt: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
          },
          {
            clientPackageId: 'p2',
            clientId: 'c5',
            clientFirstName: 'Uzak',
            clientLastName: 'Paket',
            packageName: '10 Seans',
            expiresAt: new Date(NOW.getTime() + 20 * 24 * 60 * 60 * 1000),
          },
        ],
      },
      NOW,
    )

    expect(feed.todayAppointmentsCount).toBe(4)
    expect(feed.noShowCount).toBe(1)
    expect(feed.staleMeasurementCount).toBe(1)
    expect(feed.staleMeasurementClients[0]?.clientId).toBe('c2')
    expect(feed.expiringPackageCount).toBe(1)
    expect(feed.expiringPackages[0]?.clientPackageId).toBe('p1')
    expect(feed.expiringPackages[0]?.state).toBe('yaklaşıyor')
  })
})
