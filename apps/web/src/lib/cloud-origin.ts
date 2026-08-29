export const DEFAULT_OGUN_CLOUD_ORIGIN = 'https://ogun-web.vercel.app'

/** Cloud is a synchronization/auth service; it is never the desktop renderer. */
export function getOgunCloudOrigin(): string {
  const configured =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim() : undefined
  return (configured || DEFAULT_OGUN_CLOUD_ORIGIN).replace(/\/$/, '')
}

export function cloudUrl(path: string): string {
  return new URL(path, `${getOgunCloudOrigin()}/`).toString()
}
