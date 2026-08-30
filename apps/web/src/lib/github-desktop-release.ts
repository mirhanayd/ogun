export type DesktopDownloadPlatform = 'windows' | 'macos'
export type DesktopDownloadFormat = 'exe' | 'msi' | 'dmg'

type GitHubReleaseAsset = {
  name?: unknown
  browser_download_url?: unknown
}

type GitHubRelease = {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
  assets?: unknown
}

const ASSET_PATTERNS: Record<DesktopDownloadFormat, RegExp> = {
  exe: /^Ogun_\d+\.\d+\.\d+_x64-setup\.exe$/,
  msi: /^Ogun_\d+\.\d+\.\d+_x64_tr-TR\.msi$/,
  dmg: /^Ogun_\d+\.\d+\.\d+_universal\.dmg$/,
}

function asciiAssetName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
}

export function selectLatestDesktopAsset(
  input: unknown,
  platform: DesktopDownloadPlatform,
  format: DesktopDownloadFormat,
) {
  if (!Array.isArray(input)) return null
  if (platform === 'windows' && format === 'dmg') return null
  if (platform === 'macos' && format !== 'dmg') return null

  const releases = input as GitHubRelease[]
  for (const release of releases) {
    if (
      typeof release.tag_name !== 'string' ||
      !/^desktop-v\d+\.\d+\.\d+$/.test(release.tag_name) ||
      release.draft === true ||
      release.prerelease === true ||
      !Array.isArray(release.assets)
    ) {
      continue
    }

    for (const candidate of release.assets as GitHubReleaseAsset[]) {
      if (
        typeof candidate.name !== 'string' ||
        typeof candidate.browser_download_url !== 'string' ||
        !ASSET_PATTERNS[format].test(asciiAssetName(candidate.name))
      ) {
        continue
      }
      const url = new URL(candidate.browser_download_url)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'github.com' ||
        !url.pathname.startsWith('/mirhanayd/ogun/releases/download/')
      ) {
        continue
      }
      return { tag: release.tag_name, name: candidate.name, url: url.toString() }
    }
  }
  return null
}
