import { and, eq } from 'drizzle-orm'
import type { Database } from '../client'
import { desktopMutationReceipts } from '../schema'

export async function getDesktopMutationReceipt(
  db: Database,
  clinicId: string,
  userId: string,
  mutationId: string,
) {
  const [receipt] = await db
    .select()
    .from(desktopMutationReceipts)
    .where(
      and(
        eq(desktopMutationReceipts.clinicId, clinicId),
        eq(desktopMutationReceipts.userId, userId),
        eq(desktopMutationReceipts.mutationId, mutationId),
      ),
    )
    .limit(1)
  return receipt ?? null
}

export async function recordDesktopMutationReceipt(
  db: Database,
  input: {
    clinicId: string
    userId: string
    mutationId: string
    kind: string
    idMap: Record<string, string>
  },
) {
  await db
    .insert(desktopMutationReceipts)
    .values({
      clinicId: input.clinicId,
      userId: input.userId,
      mutationId: input.mutationId,
      kind: input.kind,
      result: { idMap: input.idMap },
    })
    .onConflictDoNothing()
}
