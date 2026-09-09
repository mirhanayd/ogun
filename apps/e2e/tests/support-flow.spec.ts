import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { loadE2eCredentials, loginAndEnsureOnboarded } from '../fixtures/auth'

test.describe('Destek talebi akışı', () => {
  test('clinic owner creates a ticket and sees only public admin replies', async ({ page }) => {
    test.setTimeout(60_000)
    const credentials = loadE2eCredentials()
    const suffix = Date.now().toString(36)
    const title = `E2E senkronizasyon sorunu ${suffix}`
    const internalBody = `Yalnız Ogun ekibi ${suffix}`
    const publicBody = `Klinikle paylaşılan güncelleme ${suffix}`
    const resolutionBody = `Sorun kalıcı olarak çözüldü ${suffix}`

    await loginAndEnsureOnboarded(page, credentials.clinicA.email, credentials.clinicA.password)
    await page.goto('/ayarlar')
    await page.getByRole('link', { name: /Destek & Geri Bildirim/ }).click()
    await expect(page).toHaveURL(/\/ayarlar\/destek$/)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Destek & Geri Bildirim' })).toBeVisible()
    await expect(main.getByLabel(/P1|P2|P3|P4|Öncelik/i)).toHaveCount(0)

    await main.getByLabel('Tür').selectOption('technical_issue')
    await main.getByLabel('Bildirilen etki').selectOption('major')
    await main.getByLabel('Başlık').fill(title)
    await main.getByLabel('İlgili alan').selectOption('desktop_sync')
    await main.getByLabel('Açıklama').fill('Masaüstü uygulamasında senkronizasyon işlemi tamamlanmıyor.')
    await main.getByRole('button', { name: 'Talebi gönder' }).click()
    await page.waitForURL(/\/ayarlar\/destek\/[^/?]+/)
    const ticketId = decodeURIComponent(page.url().split('/ayarlar/destek/')[1]!.split(/[?#]/)[0]!)
    await expect(main.getByRole('heading', { name: /^SUP-[A-Z0-9]{8}$/ })).toBeVisible()

    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) throw new Error('DATABASE_URL is required for support E2E fixture updates')
    const sql = postgres(databaseUrl)
    try {
      await sql.begin(async (tx) => {
        await tx`update support_tickets set triage_priority = 'P2', status = 'resolved', resolved_at = now(), last_activity_at = now(), updated_at = now() where id = ${ticketId}`
        await tx`insert into support_ticket_messages (id, ticket_id, client_request_id, author_platform_staff_id, visibility, body) values (${randomUUID()}, ${ticketId}, ${`e2e-internal-${suffix}`}, ${credentials.supportStaff.id}, 'internal', ${internalBody})`
        await tx`insert into support_ticket_messages (id, ticket_id, client_request_id, author_platform_staff_id, visibility, body) values (${randomUUID()}, ${ticketId}, ${`e2e-public-${suffix}`}, ${credentials.supportStaff.id}, 'public', ${publicBody})`
        await tx`insert into support_ticket_messages (id, ticket_id, client_request_id, author_platform_staff_id, visibility, body) values (${randomUUID()}, ${ticketId}, ${`e2e-resolve-${suffix}`}, ${credentials.supportStaff.id}, 'public', ${resolutionBody})`
      })
      const queue = await sql<{ id: string; triage_priority: string; status: string }[]>`select id, triage_priority, status from support_tickets where id = ${ticketId}`
      expect(queue[0]).toMatchObject({ id: ticketId, triage_priority: 'P2', status: 'resolved' })
    } finally {
      await sql.end()
    }

    await page.reload()
    const conversation = main.getByRole('region', { name: 'Destek konuşması' })
    const publicMessage = conversation.getByText(publicBody)
    const resolutionMessage = conversation.getByText(resolutionBody)
    await expect(publicMessage).toHaveCount(1)
    await expect(publicMessage).toBeVisible()
    await expect(resolutionMessage).toHaveCount(1)
    await expect(resolutionMessage).toBeVisible()
    await expect(conversation.getByText(internalBody)).toHaveCount(0)
    await expect(main.getByRole('button', { name: 'Sorun devam ediyor' })).toBeVisible()

    await page.getByRole('link', { name: /Destek talepleri/ }).click()
    await expect(main.getByText(title)).toBeVisible()
  })
})
