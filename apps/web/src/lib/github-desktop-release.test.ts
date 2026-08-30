import { describe, expect, test } from 'vitest'
import { selectLatestDesktopAsset } from './github-desktop-release'

const releases = [
  {
    tag_name: 'desktop-v0.3.1',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'Ogun_0.3.1_x64-setup.exe',
        browser_download_url:
          'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.3.1/Ogun_0.3.1_x64-setup.exe',
      },
      {
        name: 'Ogun_0.3.1_x64_tr-TR.msi',
        browser_download_url:
          'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.3.1/Ogun_0.3.1_x64_tr-TR.msi',
      },
      {
        name: 'Ogun_0.3.1_universal.dmg',
        browser_download_url:
          'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.3.1/Ogun_0.3.1_universal.dmg',
      },
    ],
  },
]

describe('GitHub desktop release resolver', () => {
  test('selects the latest published Windows EXE', () => {
    expect(selectLatestDesktopAsset(releases, 'windows', 'exe')).toMatchObject({
      tag: 'desktop-v0.3.1',
      name: 'Ogun_0.3.1_x64-setup.exe',
    })
  })

  test('selects a macOS universal DMG', () => {
    expect(selectLatestDesktopAsset(releases, 'macos', 'dmg')?.name).toBe(
      'Ogun_0.3.1_universal.dmg',
    )
  })

  test('rejects incompatible platform and format combinations', () => {
    expect(selectLatestDesktopAsset(releases, 'macos', 'exe')).toBeNull()
    expect(selectLatestDesktopAsset(releases, 'windows', 'dmg')).toBeNull()
  })

  test('ignores draft releases and untrusted asset hosts', () => {
    expect(
      selectLatestDesktopAsset(
        [
          { ...releases[0], draft: true },
          {
            ...releases[0],
            assets: [
              {
                name: 'Ogun_0.3.1_x64-setup.exe',
                browser_download_url: 'https://example.com/Ogun_0.3.1_x64-setup.exe',
              },
            ],
          },
        ],
        'windows',
        'exe',
      ),
    ).toBeNull()
  })
})
