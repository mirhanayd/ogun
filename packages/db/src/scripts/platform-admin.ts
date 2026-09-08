import { db } from '../client'
import { platformStaffRoleEnum, type PlatformStaffRole } from '../schema'
import { grantPlatformStaff, revokePlatformStaff } from '../queries/platform-admin'

function valueAfter(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const command = process.argv[2]
  const email = valueAfter('--email')
  if (!email) throw new Error('--email zorunludur.')

  if (command === 'grant') {
    const role = valueAfter('--role')
    if (!role || !platformStaffRoleEnum.enumValues.includes(role as PlatformStaffRole)) {
      throw new Error(`--role şu değerlerden biri olmalıdır: ${platformStaffRoleEnum.enumValues.join(', ')}`)
    }
    const result = await grantPlatformStaff(db, { email, role: role as PlatformStaffRole })
    console.info(`Platform erişimi verildi: ${result.user.email} (${result.staff.role})`)
    return
  }

  if (command === 'revoke') {
    const result = await revokePlatformStaff(db, email)
    console.info(
      result.alreadyInactive
        ? `Platform erişimi zaten kapalı: ${email}`
        : `Platform erişimi kapatıldı: ${email}`,
    )
    return
  }

  throw new Error('Kullanım: platform-admin.ts <grant|revoke> --email <adres> [--role <rol>]')
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$client.end()
  })
