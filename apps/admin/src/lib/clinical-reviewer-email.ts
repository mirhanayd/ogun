import 'server-only'
import {
  buildClinicalReviewerInvitationEmail,
  buildClinicalReviewerVerificationEmail,
  getEmailSender,
  type EmailSender,
} from '@ogun/email'
import { writeFile } from 'node:fs/promises'

export async function sendClinicalReviewerInvitationEmail(
  input: {
    email: string
    name: string
    professionalRole: string
    specialty: string | null
    invitationUrl: string
    expiresAt: Date
  },
  sender: EmailSender = getEmailSender(),
) {
  const message = buildClinicalReviewerInvitationEmail(input)
  const capturePath = process.env.CLINICAL_REVIEW_INVITATION_CAPTURE_PATH
  if (capturePath) {
    await writeFile(
      capturePath,
      JSON.stringify({ ...message, invitationUrl: input.invitationUrl }, null, 2),
      'utf8',
    )
    return
  }
  await sender.send(message)
}

export async function sendClinicalReviewerVerificationEmail(
  input: { email: string; name: string; assignedReviewsUrl: string },
  sender: EmailSender = getEmailSender(),
) {
  await sender.send(buildClinicalReviewerVerificationEmail(input))
}
