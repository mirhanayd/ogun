export type ClinicRole = 'owner' | 'dietitian' | 'assistant'
export type DomainEntity = Record<string, unknown> & { id: string }

export interface LocalScope {
  userId: string
  clinicId: string
  role: ClinicRole
}

export interface WorkspaceSnapshot {
  version: number
  scope: LocalScope
  clinic: DomainEntity & { name: string; logoUrl?: string | null; primaryColor?: string | null }
  capabilities: string[]
  clients: DomainEntity[]
  anamneses: DomainEntity[]
  measurements: DomainEntity[]
  labResults: DomainEntity[]
  goals: DomainEntity[]
  plans: DomainEntity[]
  appointments: DomainEntity[]
  customFoods: DomainEntity[]
  syncedAt: string
}

export interface MutationInput {
  id: string
  kind: string
  entityType: string
  entityId: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface ClientsRepository {
  list(): Promise<DomainEntity[]>
  get(id: string): Promise<DomainEntity | null>
  create(input: DomainEntity): Promise<void>
  update(id: string, patch: Record<string, unknown>): Promise<void>
  archive(id: string): Promise<void>
}

export interface ClinicalRepository {
  listForClient(domain: 'anamneses' | 'measurements' | 'labResults' | 'goals', clientId: string): Promise<DomainEntity[]>
  upsert(domain: 'anamneses' | 'measurements' | 'labResults' | 'goals', entity: DomainEntity): Promise<void>
}

export interface PlansRepository {
  list(clientId?: string): Promise<DomainEntity[]>
  get(id: string): Promise<DomainEntity | null>
  upsert(plan: DomainEntity): Promise<void>
}

export interface AppointmentsRepository {
  list(range?: { from: string; to: string }): Promise<DomainEntity[]>
  upsert(appointment: DomainEntity): Promise<void>
}

export interface FoodsRepository {
  search(query: string, limit?: number): Promise<DomainEntity[]>
  get(id: string): Promise<DomainEntity | null>
}

export interface OgunRepositories {
  clients: ClientsRepository
  clinical: ClinicalRepository
  plans: PlansRepository
  appointments: AppointmentsRepository
  foods: FoodsRepository
}
