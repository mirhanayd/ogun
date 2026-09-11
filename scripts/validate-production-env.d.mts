export interface ProductionEnvironmentCheck { name: string; ok: boolean }
export interface ProductionEnvironmentResult { ok: boolean; checks: ProductionEnvironmentCheck[] }
export function validateProductionEnvironment(env?: Record<string, string | undefined>): ProductionEnvironmentResult
export function printValidation(result: ProductionEnvironmentResult, logger?: Pick<Console, 'log'>): void
