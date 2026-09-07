'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { publishReviewedClinicalInteraction } from '@ogun/etl/clinical-review-publisher'
import {
  assertClinicalReviewEnabled,
  requirePublisherAdmin,
} from '@/lib/clinical-review/authz'

export interface PublishResult {
  success: boolean
  interactionId?: string
  alreadyPublished?: boolean
  error?: string
}

export async function publishTaskAction(taskId: string): Promise<PublishResult> {
  try {
    assertClinicalReviewEnabled()
    const session = await requirePublisherAdmin()

    const result = await publishReviewedClinicalInteraction(db, {
      taskId,
      publisherUserId: session.user.id,
    })

    revalidatePath('/clinical-review/admin/publish')
    revalidatePath('/clinical-review/queue')
    revalidatePath('/clinical-review')
    revalidatePath(`/clinical-review/task/${taskId}`)

    return {
      success: true,
      interactionId: result.interactionId,
      alreadyPublished: result.alreadyPublished,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Yayınlama işlemi başarısız oldu.',
    }
  }
}
