import { randomBytes } from 'node:crypto'
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Database } from '../client'
import { canAdminTransitionSupportTicket, canClinicReopenSupportTicket, SUPPORT_PRIORITIES, SUPPORT_REPORTED_IMPACTS, SUPPORT_TICKET_AREAS, SUPPORT_TICKET_TYPES } from '../support-domain'
import {
  clinicMembers, clinics, platformAuditLogs, platformStaff, supportEmailNotifications,
  supportTicketEvents, supportTicketMessages, supportTickets, users,
  type SupportMessageVisibility, type SupportNotificationType, type SupportTicketArea,
  type SupportTicketPriority, type SupportTicketReportedImpact, type SupportTicketStatus,
  type SupportTicketType,
} from '../schema'

const OPEN_STATUSES: SupportTicketStatus[] = ['submitted', 'triaged', 'in_progress', 'waiting_for_clinic', 'reopened']
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface SupportActorMetadata {
  actorUserId: string
  platformStaffId: string
  ipAddress?: string | null
  userAgent?: string | null
}

export interface CreateSupportTicketInput {
  clinicId: string
  requesterUserId: string
  clientRequestId: string
  type: SupportTicketType
  area: SupportTicketArea
  otherArea?: string | null
  title: string
  reportedImpact: SupportTicketReportedImpact
  body: string
}

function cleanText(value: string, min: number, max: number, label: string) {
  const result = value.trim()
  if (result.length < min || result.length > max) throw new Error(`${label} ${min}-${max} karakter olmalıdır.`)
  return result
}

function validateTicketInput(input: CreateSupportTicketInput) {
  if (!SUPPORT_TICKET_TYPES.includes(input.type)) throw new Error('Geçersiz talep türü.')
  if (!SUPPORT_TICKET_AREAS.includes(input.area)) throw new Error('Geçersiz uygulama alanı.')
  if (!SUPPORT_REPORTED_IMPACTS.includes(input.reportedImpact)) throw new Error('Geçersiz etki seçimi.')
  const otherArea = input.area === 'other' ? cleanText(input.otherArea ?? '', 2, 80, 'Diğer alan') : null
  return {
    title: cleanText(input.title, 5, 160, 'Başlık'),
    body: cleanText(input.body, 20, 5000, 'Açıklama'),
    clientRequestId: cleanText(input.clientRequestId, 8, 100, 'İstek kimliği'),
    otherArea,
  }
}

export function generateSupportReferenceCode() {
  const bytes = randomBytes(8)
  let suffix = ''
  for (let index = 0; index < 8; index += 1) suffix += REF_ALPHABET[bytes[index]! % REF_ALPHABET.length]
  return `SUP-${suffix}`
}

async function requireClinicOwner(tx: Parameters<Parameters<Database['transaction']>[0]>[0], clinicId: string, userId: string) {
  const [member] = await tx.select({ id: clinicMembers.id, email: users.email })
    .from(clinicMembers).innerJoin(users, eq(users.id, clinicMembers.userId))
    .where(and(eq(clinicMembers.clinicId, clinicId), eq(clinicMembers.userId, userId), eq(clinicMembers.role, 'owner'))).limit(1)
  if (!member) throw new Error('Destek taleplerini yalnız klinik sahibi kullanabilir.')
  return member
}

export async function createSupportTicketForClinic(db: Database, input: CreateSupportTicketInput) {
  const value = validateTicketInput(input)
  const [ownerAccess] = await db.select({ id: clinicMembers.id }).from(clinicMembers).where(and(
    eq(clinicMembers.clinicId, input.clinicId),
    eq(clinicMembers.userId, input.requesterUserId),
    eq(clinicMembers.role, 'owner'),
  )).limit(1)
  if (!ownerAccess) throw new Error('Destek taleplerini yalnız klinik sahibi kullanabilir.')
  const [existing] = await db.select({ id: supportTickets.id, referenceCode: supportTickets.referenceCode })
    .from(supportTickets).where(and(eq(supportTickets.requesterUserId, input.requesterUserId), eq(supportTickets.clientRequestId, value.clientRequestId))).limit(1)
  if (existing) return { ...existing, notificationId: null, duplicate: true }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referenceCode = generateSupportReferenceCode()
    const collision = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.referenceCode, referenceCode)).limit(1)
    if (collision.length) continue
    try {
      return await db.transaction(async (tx) => {
        const owner = await requireClinicOwner(tx, input.clinicId, input.requesterUserId)
        const now = new Date()
        const [ticket] = await tx.insert(supportTickets).values({
          referenceCode, clinicId: input.clinicId, requesterUserId: input.requesterUserId,
          clientRequestId: value.clientRequestId, type: input.type, area: input.area,
          otherArea: value.otherArea, title: value.title, reportedImpact: input.reportedImpact,
          status: 'submitted', lastActivityAt: now,
        }).returning({ id: supportTickets.id, referenceCode: supportTickets.referenceCode })
        if (!ticket) throw new Error('Destek talebi oluşturulamadı.')
        const [message] = await tx.insert(supportTicketMessages).values({
          ticketId: ticket.id, clientRequestId: `${value.clientRequestId}:initial`, authorUserId: input.requesterUserId,
          visibility: 'public', body: value.body,
        }).returning({ id: supportTicketMessages.id })
        const [event] = await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: 'created', actorUserId: input.requesterUserId, toStatus: 'submitted' }).returning({ id: supportTicketEvents.id })
        if (!message || !event) throw new Error('Destek talebi geçmişi oluşturulamadı.')
        const [notification] = await tx.insert(supportEmailNotifications).values({
          ticketId: ticket.id, messageId: message.id, eventId: event.id, type: 'ticket_created',
          recipientUserId: input.requesterUserId, recipientEmail: owner.email,
        }).returning({ id: supportEmailNotifications.id })
        return { ...ticket, notificationId: notification?.id ?? null, duplicate: false }
      })
    } catch (error) {
      const postgresError = error as { code?: string; constraint_name?: string }
      if (postgresError.code !== '23505') throw error
      const [concurrentDuplicate] = await db.select({ id: supportTickets.id, referenceCode: supportTickets.referenceCode })
        .from(supportTickets).where(and(eq(supportTickets.requesterUserId, input.requesterUserId), eq(supportTickets.clientRequestId, value.clientRequestId))).limit(1)
      if (concurrentDuplicate) return { ...concurrentDuplicate, notificationId: null, duplicate: true }
      if (postgresError.constraint_name !== 'support_tickets_reference_code_idx') throw error
    }
  }
  throw new Error('Benzersiz destek referansı üretilemedi; lütfen yeniden deneyin.')
}

const clinicTicketProjection = {
  id: supportTickets.id, referenceCode: supportTickets.referenceCode, title: supportTickets.title,
  type: supportTickets.type, area: supportTickets.area, otherArea: supportTickets.otherArea,
  reportedImpact: supportTickets.reportedImpact, status: supportTickets.status,
  createdAt: supportTickets.createdAt, lastActivityAt: supportTickets.lastActivityAt,
} as const

export async function listSupportTicketsForClinic(db: Database, clinicId: string) {
  return db.select(clinicTicketProjection).from(supportTickets).where(eq(supportTickets.clinicId, clinicId)).orderBy(desc(supportTickets.lastActivityAt))
}

export async function getSupportTicketForClinic(db: Database, clinicId: string, ticketId: string) {
  const [row] = await db.select(clinicTicketProjection).from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clinicId, clinicId))).limit(1)
  return row ?? null
}

export async function getPublicSupportMessagesForClinic(db: Database, clinicId: string, ticketId: string) {
  const staffUser = alias(users, 'support_message_staff_user')
  return db.select({
    id: supportTicketMessages.id, body: supportTicketMessages.body, createdAt: supportTicketMessages.createdAt,
    authorName: sql<string>`coalesce(${users.name}, ${staffUser.name}, 'Ogun Destek')`,
  }).from(supportTicketMessages)
    .innerJoin(supportTickets, and(eq(supportTickets.id, supportTicketMessages.ticketId), eq(supportTickets.clinicId, clinicId)))
    .leftJoin(users, eq(users.id, supportTicketMessages.authorUserId))
    .leftJoin(platformStaff, eq(platformStaff.id, supportTicketMessages.authorPlatformStaffId))
    .leftJoin(staffUser, eq(staffUser.id, platformStaff.userId))
    .where(and(eq(supportTicketMessages.ticketId, ticketId), eq(supportTicketMessages.visibility, 'public')))
    .orderBy(asc(supportTicketMessages.createdAt))
}

export async function addClinicSupportReply(db: Database, input: { clinicId: string; userId: string; ticketId: string; clientRequestId: string; body: string }) {
  const body = cleanText(input.body, 2, 5000, 'Yanıt')
  const clientRequestId = cleanText(input.clientRequestId, 8, 100, 'İstek kimliği')
  return db.transaction(async (tx) => {
    await requireClinicOwner(tx, input.clinicId, input.userId)
    const [ticket] = await tx.select({ id: supportTickets.id, status: supportTickets.status }).from(supportTickets)
      .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.clinicId, input.clinicId))).for('update').limit(1)
    if (!ticket) throw new Error('Destek talebi bulunamadı.')
    if (ticket.status === 'closed' || ticket.status === 'resolved') throw new Error('Bu talebe normal yanıt eklenemez.')
    const [existing] = await tx.select({ id: supportTicketMessages.id }).from(supportTicketMessages)
      .where(and(eq(supportTicketMessages.ticketId, ticket.id), eq(supportTicketMessages.clientRequestId, clientRequestId))).limit(1)
    if (existing) return { id: existing.id, duplicate: true, status: ticket.status }
    const now = new Date()
    const nextStatus = ticket.status === 'waiting_for_clinic' ? 'in_progress' as const : ticket.status
    const [message] = await tx.insert(supportTicketMessages).values({ ticketId: ticket.id, clientRequestId, authorUserId: input.userId, visibility: 'public', body }).returning({ id: supportTicketMessages.id })
    if (nextStatus !== ticket.status) await tx.update(supportTickets).set({ status: nextStatus, lastActivityAt: now, updatedAt: now }).where(eq(supportTickets.id, ticket.id))
    else await tx.update(supportTickets).set({ lastActivityAt: now, updatedAt: now }).where(eq(supportTickets.id, ticket.id))
    await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: nextStatus === ticket.status ? 'public_reply_added' : 'status_changed', actorUserId: input.userId, fromStatus: nextStatus === ticket.status ? null : ticket.status, toStatus: nextStatus === ticket.status ? null : nextStatus, metadata: { messageId: message!.id } })
    return { id: message!.id, duplicate: false, status: nextStatus }
  })
}

export async function reopenSupportTicketForClinic(db: Database, input: { clinicId: string; userId: string; ticketId: string }) {
  return db.transaction(async (tx) => {
    const owner = await requireClinicOwner(tx, input.clinicId, input.userId)
    const [ticket] = await tx.select({ id: supportTickets.id, status: supportTickets.status }).from(supportTickets)
      .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.clinicId, input.clinicId))).for('update').limit(1)
    if (!ticket || !canClinicReopenSupportTicket(ticket.status)) throw new Error('Yalnız çözülmüş talep yeniden açılabilir.')
    const now = new Date()
    await tx.update(supportTickets).set({ status: 'reopened', resolvedAt: null, closedAt: null, lastActivityAt: now, updatedAt: now }).where(eq(supportTickets.id, ticket.id))
    const [event] = await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: 'reopened', actorUserId: input.userId, fromStatus: 'resolved', toStatus: 'reopened' }).returning({ id: supportTicketEvents.id })
    const [notification] = await tx.insert(supportEmailNotifications).values({ ticketId: ticket.id, eventId: event!.id, type: 'reopened', recipientUserId: input.userId, recipientEmail: owner.email }).returning({ id: supportEmailNotifications.id })
    return { id: ticket.id, notificationId: notification!.id }
  })
}

export interface PlatformSupportFilters {
  search?: string; status?: SupportTicketStatus; priority?: SupportTicketPriority | 'untriaged'; type?: SupportTicketType
  area?: SupportTicketArea; clinicId?: string; assignedPlatformStaffId?: string | 'unassigned'; queue?: 'open' | 'untriaged' | 'resolved' | 'all'
  page?: number; pageSize?: 25 | 50 | 100
}

function platformConditions(filters: PlatformSupportFilters) {
  const requester = alias(users, 'support_filter_requester')
  const conditions = []
  const search = filters.search?.trim()
  if (search) conditions.push(or(ilike(supportTickets.referenceCode, `%${search}%`), ilike(supportTickets.title, `%${search}%`), ilike(clinics.name, `%${search}%`), ilike(requester.name, `%${search}%`), ilike(requester.email, `%${search}%`))!)
  if (filters.status) conditions.push(eq(supportTickets.status, filters.status))
  if (filters.priority === 'untriaged') conditions.push(isNull(supportTickets.triagePriority))
  else if (filters.priority) conditions.push(eq(supportTickets.triagePriority, filters.priority))
  if (filters.type) conditions.push(eq(supportTickets.type, filters.type))
  if (filters.area) conditions.push(eq(supportTickets.area, filters.area))
  if (filters.clinicId) conditions.push(eq(supportTickets.clinicId, filters.clinicId))
  if (filters.assignedPlatformStaffId === 'unassigned') conditions.push(isNull(supportTickets.assignedPlatformStaffId))
  else if (filters.assignedPlatformStaffId) conditions.push(eq(supportTickets.assignedPlatformStaffId, filters.assignedPlatformStaffId))
  if (!filters.status && filters.queue !== 'all') {
    if (filters.queue === 'resolved') conditions.push(inArray(supportTickets.status, ['resolved', 'closed']))
    else if (filters.queue === 'untriaged') conditions.push(and(eq(supportTickets.status, 'submitted'), isNull(supportTickets.triagePriority))!)
    else conditions.push(inArray(supportTickets.status, OPEN_STATUSES))
  }
  return { where: conditions.length ? and(...conditions) : undefined, requester }
}

export async function listSupportTicketsForPlatform(db: Database, filters: PlatformSupportFilters = {}) {
  const requestedPage = Math.trunc(filters.page ?? 1)
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1
  const pageSize = filters.pageSize === 50 || filters.pageSize === 100 ? filters.pageSize : 25
  const { where, requester } = platformConditions(filters)
  const assigneeUser = alias(users, 'support_assignee_user')
  const base = { requester, assigneeUser }
  const rows = await db.select({
    id: supportTickets.id, referenceCode: supportTickets.referenceCode, title: supportTickets.title,
    clinicId: clinics.id, clinicName: clinics.name, requesterName: base.requester.name, requesterEmail: base.requester.email,
    type: supportTickets.type, area: supportTickets.area, otherArea: supportTickets.otherArea,
    reportedImpact: supportTickets.reportedImpact, triagePriority: supportTickets.triagePriority,
    status: supportTickets.status, assignedPlatformStaffId: supportTickets.assignedPlatformStaffId,
    assignedName: base.assigneeUser.name, lastActivityAt: supportTickets.lastActivityAt, createdAt: supportTickets.createdAt,
  }).from(supportTickets).innerJoin(clinics, eq(clinics.id, supportTickets.clinicId))
    .innerJoin(requester, eq(requester.id, supportTickets.requesterUserId))
    .leftJoin(platformStaff, eq(platformStaff.id, supportTickets.assignedPlatformStaffId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, platformStaff.userId)).where(where)
    .orderBy(sql`case when ${supportTickets.status} = 'submitted' and ${supportTickets.triagePriority} is null then 0 when ${supportTickets.status} in ('resolved','closed') then 2 else 1 end`, sql`case ${supportTickets.triagePriority} when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 when 'P4' then 4 else 0 end`, desc(supportTickets.lastActivityAt))
    .limit(pageSize).offset((page - 1) * pageSize)
  const [total] = await db.select({ value: count() }).from(supportTickets).innerJoin(clinics, eq(clinics.id, supportTickets.clinicId)).innerJoin(requester, eq(requester.id, supportTickets.requesterUserId)).where(where)
  return { rows, total: total?.value ?? 0, page, pageSize }
}

export async function getSupportTicketForPlatform(db: Database, ticketId: string) {
  const requester = alias(users, 'support_detail_requester')
  const assigneeUser = alias(users, 'support_detail_assignee')
  const [row] = await db.select({
    id: supportTickets.id, referenceCode: supportTickets.referenceCode, title: supportTickets.title,
    clinicId: clinics.id, clinicName: clinics.name, requesterUserId: requester.id, requesterName: requester.name, requesterEmail: requester.email,
    type: supportTickets.type, area: supportTickets.area, otherArea: supportTickets.otherArea, reportedImpact: supportTickets.reportedImpact,
    triagePriority: supportTickets.triagePriority, status: supportTickets.status, assignedPlatformStaffId: supportTickets.assignedPlatformStaffId,
    assignedName: assigneeUser.name, lastActivityAt: supportTickets.lastActivityAt, triagedAt: supportTickets.triagedAt,
    resolvedAt: supportTickets.resolvedAt, closedAt: supportTickets.closedAt, createdAt: supportTickets.createdAt,
  }).from(supportTickets).innerJoin(clinics, eq(clinics.id, supportTickets.clinicId)).innerJoin(requester, eq(requester.id, supportTickets.requesterUserId))
    .leftJoin(platformStaff, eq(platformStaff.id, supportTickets.assignedPlatformStaffId)).leftJoin(assigneeUser, eq(assigneeUser.id, platformStaff.userId))
    .where(eq(supportTickets.id, ticketId)).limit(1)
  return row ?? null
}

export async function getSupportTicketMessagesForPlatform(db: Database, ticketId: string) {
  const authorUser = alias(users, 'support_author_user')
  const staffUser = alias(users, 'support_author_staff_user')
  return db.select({ id: supportTicketMessages.id, visibility: supportTicketMessages.visibility, body: supportTicketMessages.body, createdAt: supportTicketMessages.createdAt, authorName: sql<string>`coalesce(${authorUser.name}, ${staffUser.name}, 'Ogun Destek')` })
    .from(supportTicketMessages).leftJoin(authorUser, eq(authorUser.id, supportTicketMessages.authorUserId))
    .leftJoin(platformStaff, eq(platformStaff.id, supportTicketMessages.authorPlatformStaffId)).leftJoin(staffUser, eq(staffUser.id, platformStaff.userId))
    .where(eq(supportTicketMessages.ticketId, ticketId)).orderBy(asc(supportTicketMessages.createdAt))
}

export async function getSupportTicketEventsForPlatform(db: Database, ticketId: string) {
  return db.select().from(supportTicketEvents).where(eq(supportTicketEvents.ticketId, ticketId)).orderBy(asc(supportTicketEvents.createdAt))
}

export async function listSupportNotificationsForPlatform(db: Database, ticketId: string) {
  return db.select({ id: supportEmailNotifications.id, type: supportEmailNotifications.type, status: supportEmailNotifications.status, attemptCount: supportEmailNotifications.attemptCount, lastAttemptAt: supportEmailNotifications.lastAttemptAt, sentAt: supportEmailNotifications.sentAt, lastError: supportEmailNotifications.lastError, createdAt: supportEmailNotifications.createdAt })
    .from(supportEmailNotifications).where(eq(supportEmailNotifications.ticketId, ticketId)).orderBy(desc(supportEmailNotifications.createdAt))
}

export async function listActivePlatformStaffForSupport(db: Database) {
  return db.select({ id: platformStaff.id, name: users.name, email: users.email, role: platformStaff.role }).from(platformStaff).innerJoin(users, eq(users.id, platformStaff.userId)).where(eq(platformStaff.isActive, true)).orderBy(users.name)
}

export async function getActivePlatformStaffForAssignment(db: Database, staffId: string) {
  const [row] = await db.select({ id: platformStaff.id, role: platformStaff.role, isActive: platformStaff.isActive }).from(platformStaff).where(and(eq(platformStaff.id, staffId), eq(platformStaff.isActive, true))).limit(1)
  return row ?? null
}

function auditValues(actor: SupportActorMetadata, ticket: { id: string; clinicId: string }, action: string, metadata?: Record<string, unknown>) {
  return { actorUserId: actor.actorUserId, platformStaffId: actor.platformStaffId, action, entityType: 'support_ticket', entityId: ticket.id, clinicId: ticket.clinicId, outcome: 'success' as const, ipAddress: actor.ipAddress ?? null, userAgent: actor.userAgent ?? null, metadata }
}

async function ticketForMutation(tx: Parameters<Parameters<Database['transaction']>[0]>[0], ticketId: string) {
  const [ticket] = await tx.select({ id: supportTickets.id, clinicId: supportTickets.clinicId, requesterUserId: supportTickets.requesterUserId, status: supportTickets.status, triagePriority: supportTickets.triagePriority }).from(supportTickets).where(eq(supportTickets.id, ticketId)).for('update').limit(1)
  if (!ticket) throw new Error('Destek talebi bulunamadı.')
  return ticket
}

export async function setSupportTicketPriorityForPlatform(db: Database, input: SupportActorMetadata & { ticketId: string; priority: SupportTicketPriority }) {
  if (!SUPPORT_PRIORITIES.includes(input.priority)) throw new Error('Geçersiz öncelik.')
  return db.transaction(async (tx) => {
    const ticket = await ticketForMutation(tx, input.ticketId)
    const now = new Date()
    await tx.update(supportTickets).set({ triagePriority: input.priority, triagedAt: ticket.triagePriority ? undefined : now, updatedAt: now }).where(eq(supportTickets.id, ticket.id))
    await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: 'priority_changed', actorPlatformStaffId: input.platformStaffId, fromPriority: ticket.triagePriority, toPriority: input.priority })
    await tx.insert(platformAuditLogs).values(auditValues(input, ticket, 'support.ticket.priority_changed', { fromPriority: ticket.triagePriority, toPriority: input.priority }))
    return ticket
  })
}

function notificationForStatus(status: SupportTicketStatus): SupportNotificationType | null {
  if (status === 'waiting_for_clinic' || status === 'resolved' || status === 'closed' || status === 'reopened') return status
  return null
}

export async function transitionSupportTicketForPlatform(db: Database, input: SupportActorMetadata & { ticketId: string; toStatus: SupportTicketStatus }) {
  return db.transaction(async (tx) => {
    const ticket = await ticketForMutation(tx, input.ticketId)
    if (input.toStatus === 'resolved') throw new Error('Çözüm için public açıklama zorunludur.')
    if (!canAdminTransitionSupportTicket(ticket.status, input.toStatus)) throw new Error(`Geçersiz durum geçişi: ${ticket.status} → ${input.toStatus}`)
    const now = new Date()
    await tx.update(supportTickets).set({ status: input.toStatus, lastActivityAt: now, triagedAt: input.toStatus === 'triaged' ? now : undefined, closedAt: input.toStatus === 'closed' ? now : input.toStatus === 'reopened' ? null : undefined, resolvedAt: input.toStatus === 'reopened' ? null : undefined, updatedAt: now }).where(eq(supportTickets.id, ticket.id))
    const [event] = await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: input.toStatus === 'reopened' ? 'reopened' : 'status_changed', actorPlatformStaffId: input.platformStaffId, fromStatus: ticket.status, toStatus: input.toStatus }).returning({ id: supportTicketEvents.id })
    const [requester] = await tx.select({ email: users.email }).from(users).where(eq(users.id, ticket.requesterUserId)).limit(1)
    const type = notificationForStatus(input.toStatus)
    let notificationId: string | null = null
    if (type && requester) {
      const [notification] = await tx.insert(supportEmailNotifications).values({ ticketId: ticket.id, eventId: event!.id, type, recipientUserId: ticket.requesterUserId, recipientEmail: requester.email }).returning({ id: supportEmailNotifications.id })
      notificationId = notification?.id ?? null
    }
    await tx.insert(platformAuditLogs).values(auditValues(input, ticket, 'support.ticket.status_changed', { fromStatus: ticket.status, toStatus: input.toStatus }))
    return { ...ticket, status: input.toStatus, notificationId }
  })
}

export async function assignSupportTicketForPlatform(db: Database, input: SupportActorMetadata & { ticketId: string; assignedPlatformStaffId: string | null }) {
  return db.transaction(async (tx) => {
    const ticket = await ticketForMutation(tx, input.ticketId)
    if (input.assignedPlatformStaffId) {
      const [target] = await tx.select({ id: platformStaff.id }).from(platformStaff).where(and(eq(platformStaff.id, input.assignedPlatformStaffId), eq(platformStaff.isActive, true))).limit(1)
      if (!target) throw new Error('Atanacak aktif platform personeli bulunamadı.')
    }
    await tx.update(supportTickets).set({ assignedPlatformStaffId: input.assignedPlatformStaffId, updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id))
    const action = input.assignedPlatformStaffId ? 'support.ticket.assigned' : 'support.ticket.unassigned'
    await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: input.assignedPlatformStaffId ? 'assigned' : 'unassigned', actorPlatformStaffId: input.platformStaffId, metadata: { assignedPlatformStaffId: input.assignedPlatformStaffId } })
    await tx.insert(platformAuditLogs).values(auditValues(input, ticket, action, { assignedPlatformStaffId: input.assignedPlatformStaffId }))
    return ticket
  })
}

export async function addPlatformSupportMessage(db: Database, input: SupportActorMetadata & { ticketId: string; visibility: SupportMessageVisibility; body: string; clientRequestId: string }) {
  const body = cleanText(input.body, 2, 5000, 'Mesaj')
  const clientRequestId = cleanText(input.clientRequestId, 8, 100, 'İstek kimliği')
  return db.transaction(async (tx) => {
    const ticket = await ticketForMutation(tx, input.ticketId)
    const [existing] = await tx.select({ id: supportTicketMessages.id }).from(supportTicketMessages).where(and(eq(supportTicketMessages.ticketId, ticket.id), eq(supportTicketMessages.clientRequestId, clientRequestId))).limit(1)
    if (existing) return { id: existing.id, notificationId: null, duplicate: true }
    const now = new Date()
    const [message] = await tx.insert(supportTicketMessages).values({ ticketId: ticket.id, clientRequestId, authorPlatformStaffId: input.platformStaffId, visibility: input.visibility, body }).returning({ id: supportTicketMessages.id })
    await tx.update(supportTickets).set({ lastActivityAt: now, updatedAt: now }).where(eq(supportTickets.id, ticket.id))
    const [event] = await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: input.visibility === 'public' ? 'public_reply_added' : 'internal_note_added', actorPlatformStaffId: input.platformStaffId, metadata: { messageId: message!.id } }).returning({ id: supportTicketEvents.id })
    let notificationId: string | null = null
    if (input.visibility === 'public') {
      const [requester] = await tx.select({ email: users.email }).from(users).where(eq(users.id, ticket.requesterUserId)).limit(1)
      if (requester) notificationId = (await tx.insert(supportEmailNotifications).values({ ticketId: ticket.id, messageId: message!.id, eventId: event!.id, type: 'public_reply', recipientUserId: ticket.requesterUserId, recipientEmail: requester.email }).returning({ id: supportEmailNotifications.id }))[0]!.id
    }
    const action = input.visibility === 'public' ? 'support.ticket.public_reply_added' : 'support.ticket.internal_note_added'
    await tx.insert(platformAuditLogs).values(auditValues(input, ticket, action, { messageId: message!.id }))
    return { id: message!.id, notificationId, duplicate: false }
  })
}

export async function resolveSupportTicketForPlatform(db: Database, input: SupportActorMetadata & { ticketId: string; body: string; clientRequestId: string }) {
  const body = cleanText(input.body, 20, 5000, 'Çözüm açıklaması')
  return db.transaction(async (tx) => {
    const ticket = await ticketForMutation(tx, input.ticketId)
    if (!canAdminTransitionSupportTicket(ticket.status, 'resolved')) throw new Error(`Bu talep ${ticket.status} durumundan çözülemez.`)
    const now = new Date()
    const [message] = await tx.insert(supportTicketMessages).values({ ticketId: ticket.id, clientRequestId: cleanText(input.clientRequestId, 8, 100, 'İstek kimliği'), authorPlatformStaffId: input.platformStaffId, visibility: 'public', body }).returning({ id: supportTicketMessages.id })
    await tx.update(supportTickets).set({ status: 'resolved', resolvedAt: now, closedAt: null, lastActivityAt: now, updatedAt: now }).where(eq(supportTickets.id, ticket.id))
    const [event] = await tx.insert(supportTicketEvents).values({ ticketId: ticket.id, eventType: 'status_changed', actorPlatformStaffId: input.platformStaffId, fromStatus: ticket.status, toStatus: 'resolved', metadata: { resolutionMessageId: message!.id } }).returning({ id: supportTicketEvents.id })
    const [requester] = await tx.select({ email: users.email }).from(users).where(eq(users.id, ticket.requesterUserId)).limit(1)
    const [notification] = await tx.insert(supportEmailNotifications).values({ ticketId: ticket.id, messageId: message!.id, eventId: event!.id, type: 'resolved', recipientUserId: ticket.requesterUserId, recipientEmail: requester!.email }).returning({ id: supportEmailNotifications.id })
    await tx.insert(platformAuditLogs).values(auditValues(input, ticket, 'support.ticket.status_changed', { fromStatus: ticket.status, toStatus: 'resolved', resolutionMessageId: message!.id }))
    return { id: ticket.id, notificationId: notification!.id }
  })
}

export async function claimSupportNotification(db: Database, notificationId: string, retry: boolean) {
  const now = new Date()
  const condition = retry
    ? and(eq(supportEmailNotifications.id, notificationId), eq(supportEmailNotifications.status, 'failed'))
    : and(eq(supportEmailNotifications.id, notificationId), eq(supportEmailNotifications.status, 'pending'), isNull(supportEmailNotifications.lastAttemptAt))
  const [claimed] = await db.update(supportEmailNotifications).set({ status: 'pending', attemptCount: sql`${supportEmailNotifications.attemptCount} + 1`, lastAttemptAt: now, lastError: null, updatedAt: now }).where(condition).returning({ id: supportEmailNotifications.id })
  return claimed ?? null
}

export async function getSupportNotificationDelivery(db: Database, notificationId: string) {
  const [row] = await db.select({
    id: supportEmailNotifications.id, type: supportEmailNotifications.type, recipientEmail: supportEmailNotifications.recipientEmail,
    ticketId: supportTickets.id, referenceCode: supportTickets.referenceCode, title: supportTickets.title, status: supportTickets.status,
    messagePreview: sql<string | null>`case when ${supportTicketMessages.visibility} = 'public' then left(${supportTicketMessages.body}, 500) else null end`,
  }).from(supportEmailNotifications).innerJoin(supportTickets, eq(supportTickets.id, supportEmailNotifications.ticketId))
    .leftJoin(supportTicketMessages, eq(supportTicketMessages.id, supportEmailNotifications.messageId))
    .where(eq(supportEmailNotifications.id, notificationId)).limit(1)
  return row ?? null
}

export async function getSupportNotificationState(db: Database, notificationId: string) {
  const [row] = await db.select({
    status: supportEmailNotifications.status,
    attemptCount: supportEmailNotifications.attemptCount,
    lastError: supportEmailNotifications.lastError,
  }).from(supportEmailNotifications).where(eq(supportEmailNotifications.id, notificationId)).limit(1)
  return row ?? null
}

export async function markSupportNotificationSent(db: Database, notificationId: string) {
  const now = new Date()
  await db.update(supportEmailNotifications).set({ status: 'sent', sentAt: now, lastError: null, updatedAt: now }).where(and(eq(supportEmailNotifications.id, notificationId), eq(supportEmailNotifications.status, 'pending')))
}

export async function markSupportNotificationFailed(db: Database, notificationId: string, error: string) {
  await db.update(supportEmailNotifications).set({ status: 'failed', lastError: error.slice(0, 500), updatedAt: new Date() }).where(and(eq(supportEmailNotifications.id, notificationId), eq(supportEmailNotifications.status, 'pending')))
}

export async function recordSupportNotificationRetryAudit(db: Database, actor: SupportActorMetadata, notificationId: string, ticketId: string, clinicId: string, outcome: 'success' | 'failure', reason?: string) {
  await db.insert(platformAuditLogs).values({ actorUserId: actor.actorUserId, platformStaffId: actor.platformStaffId, action: 'support.notification.retried', entityType: 'support_notification', entityId: notificationId, clinicId, outcome, reason, ipAddress: actor.ipAddress ?? null, userAgent: actor.userAgent ?? null, metadata: { ticketId } })
}
