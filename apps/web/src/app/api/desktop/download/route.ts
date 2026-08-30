import { NextResponse } from 'next/server'
import {
  selectLatestDesktopAsset,
  type DesktopDownloadFormat,
  type DesktopDownloadPlatform,
} from '@/lib/github-desktop-release'

const RELEASES_API = 'https://api.github.com/repos/mirhanayd/ogun/releases?per_page=20'
const RELEASE_BY_TAG_API = 'https://api.github.com/repos/mirhanayd/ogun/releases/tags/'
const PLATFORMS = new Set<DesktopDownloadPlatform>(['windows', 'macos'])
const FORMATS = new Set<DesktopDownloadFormat>(['exe', 'msi', 'dmg'])

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams
  const platform = parameters.get('platform') as DesktopDownloadPlatform | null
  const format = parameters.get('format') as DesktopDownloadFormat | null
  const version = parameters.get('version')
  if (!platform || !format || !PLATFORMS.has(platform) || !FORMATS.has(format)) {
    return NextResponse.json({ error: 'Geçersiz masaüstü indirme seçeneği.' }, { status: 400 })
  }
  if (version !== null && !/^\d+\.\d+\.\d+$/.test(version)) {
    return NextResponse.json({ error: 'Geçersiz masaüstü sürümü.' }, { status: 400 })
  }

  const response = await fetch(
    version ? `${RELEASE_BY_TAG_API}desktop-v${version}` : RELEASES_API,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ogun-web-desktop-downloader',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: 300 },
    },
  )
  if (!response.ok) {
    return NextResponse.json({ error: 'Sürüm bilgisi şu anda alınamıyor.' }, { status: 502 })
  }

  const payload = await response.json()
  const asset = selectLatestDesktopAsset(Array.isArray(payload) ? payload : [payload], platform, format)
  if (!asset) {
    return NextResponse.json(
      { error: 'Bu platform için yayınlanmış kurulum dosyası yok.' },
      { status: 404 },
    )
  }

  const redirect = NextResponse.redirect(asset.url, 307)
  redirect.headers.set(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
  )
  redirect.headers.set('X-Ogun-Desktop-Release', asset.tag)
  return redirect
}
