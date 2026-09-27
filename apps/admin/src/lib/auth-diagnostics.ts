/**
 * Temporary login diagnostics: classify the configured admin DB endpoint
 * without exposing the connection string, username, password or hostname.
 *
 * Remove the console diagnostic after the production connection is corrected.
 */
export type AdminDatabaseTarget = 'production' | 'staging' | 'other' | 'missing'

const productionHost = 'ep-calm-heart-b1bm3vy6.c-5.eu-central-1.aws.neon.tech'
const stagingHost = 'ep-snowy-field-b17y5klp.c-5.eu-central-1.aws.neon.tech'

export function classifyAdminDatabaseTarget(databaseUrl: string | undefined): AdminDatabaseTarget {
  if (!databaseUrl) return 'missing'
  try {
    // Neon pooled and direct endpoints address the same underlying branch.
    const host = new URL(databaseUrl).hostname.toLowerCase().replace('-pooler.', '.')
    if (host === productionHost) return 'production'
    if (host === stagingHost) return 'staging'
    return 'other'
  } catch {
    return 'other'
  }
}
