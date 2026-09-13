type AdminDeploymentEnvironment = 'local' | 'preview' | 'production'

export type AdminEnvironmentCheck = { name: string; ok: boolean }

const PLACEHOLDER_SECRET = /(change[-_ ]?me|replace[-_ ]?me|example|dummy|minioadmin)/i

function deploymentEnvironment(env: NodeJS.ProcessEnv): AdminDeploymentEnvironment {
  if (env.VERCEL_ENV === 'production' || env.APP_ENV === 'production') return 'production'
  if (env.VERCEL_ENV === 'preview' || env.APP_ENV === 'staging') return 'preview'
  return 'local'
}

function strongSecret(value: string | undefined) {
  return Boolean(value && value.length >= 32 && !PLACEHOLDER_SECRET.test(value))
}

function validDatabaseUrl(value: string | undefined, remoteOnly: boolean) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return false
    if (!url.hostname || !url.pathname.slice(1)) return false
    return !remoteOnly || !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function normalizedOrigin(name: string, value: string | undefined, allowLocalhost: boolean) {
  if (!value) throw new Error(`${name} is required.`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(allowLocalhost && isLocal && url.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS outside local development.`)
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name} must be an origin without credentials, path, query or fragment.`)
  }
  return url.origin
}

export function resolveAdminAuthBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const target = deploymentEnvironment(env)
  if (env.ADMIN_BETTER_AUTH_URL) {
    return normalizedOrigin('ADMIN_BETTER_AUTH_URL', env.ADMIN_BETTER_AUTH_URL, target === 'local')
  }
  if (target === 'preview' && env.VERCEL_URL) {
    const hostname = env.VERCEL_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!hostname.endsWith('.vercel.app') || hostname.includes('/')) {
      throw new Error('VERCEL_URL must be a Vercel deployment hostname.')
    }
    return normalizedOrigin('VERCEL_URL', `https://${hostname}`, false)
  }
  if (target === 'local') return 'http://localhost:3001'
  throw new Error('ADMIN_BETTER_AUTH_URL is required in production.')
}

export function validateAdminEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const target = deploymentEnvironment(env)
  let authUrlValid = true
  try {
    resolveAdminAuthBaseUrl(env)
  } catch {
    authUrlValid = false
  }
  let webUrlValid = true
  try {
    normalizedOrigin('OGUN_WEB_URL', env.OGUN_WEB_URL, target === 'local')
  } catch {
    webUrlValid = false
  }

  const hasResendKey = Boolean(env.RESEND_API_KEY)
  const hasResendFrom = Boolean(env.RESEND_FROM_EMAIL)
  const checks: AdminEnvironmentCheck[] = [
    { name: 'DATABASE_URL', ok: validDatabaseUrl(env.DATABASE_URL, target !== 'local') },
    { name: 'ADMIN_BETTER_AUTH_SECRET', ok: strongSecret(env.ADMIN_BETTER_AUTH_SECRET) },
    {
      name: 'AUTH_SECRET_ISOLATION',
      ok: !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET !== env.ADMIN_BETTER_AUTH_SECRET,
    },
    { name: 'ADMIN_BETTER_AUTH_URL', ok: authUrlValid },
    { name: 'OGUN_WEB_URL', ok: webUrlValid },
    {
      name: 'RESEND',
      ok: target === 'production' ? hasResendKey && hasResendFrom : !hasResendKey && !hasResendFrom,
    },
    {
      name: 'APP_ENV',
      ok: target === 'production'
        ? env.APP_ENV === 'production'
        : target === 'preview'
          ? env.APP_ENV === 'staging'
          : !env.APP_ENV || env.APP_ENV === 'local',
    },
    {
      name: 'LOG_LEVEL',
      ok: !env.LOG_LEVEL || ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(env.LOG_LEVEL),
    },
  ]
  return { ok: checks.every((check) => check.ok), target, checks }
}

export function assertValidAdminEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const result = validateAdminEnvironment(env)
  if (!result.ok) {
    const failed = result.checks.filter((check) => !check.ok).map((check) => check.name).join(', ')
    throw new Error(`Admin environment validation failed (${result.target}): ${failed}`)
  }
  return result
}
