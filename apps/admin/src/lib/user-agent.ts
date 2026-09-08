export function describeUserAgent(userAgent: string | null, hasDevice: boolean) {
  if (hasDevice) {
    const platform = /Windows/i.test(userAgent ?? '') ? 'Windows' : /Mac/i.test(userAgent ?? '') ? 'macOS' : /Linux/i.test(userAgent ?? '') ? 'Linux' : 'Bilinmeyen platform'
    return `Ogun Desktop · ${platform}`
  }
  const platform = /Windows/i.test(userAgent ?? '') ? 'Windows' : /Mac OS|Macintosh/i.test(userAgent ?? '') ? 'macOS' : /Android/i.test(userAgent ?? '') ? 'Android' : /iPhone|iPad/i.test(userAgent ?? '') ? 'iOS' : /Linux/i.test(userAgent ?? '') ? 'Linux' : 'Bilinmeyen platform'
  const browser = /Edg\//i.test(userAgent ?? '') ? 'Edge' : /Chrome\//i.test(userAgent ?? '') ? 'Chrome' : /Firefox\//i.test(userAgent ?? '') ? 'Firefox' : /Safari\//i.test(userAgent ?? '') ? 'Safari' : 'Tarayıcı'
  return `${platform} · ${browser}`
}
