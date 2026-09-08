import 'server-only'
import { Resend } from 'resend'
import type { EmailSender, SendEmailInput } from './types'

export function createResendEmailSender(): EmailSender {
  return {
    async send(input: SendEmailInput): Promise<void> {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) throw new Error('RESEND_API_KEY ortam değişkeni tanımlı değil.')
      const from = process.env.RESEND_FROM_EMAIL
      if (!from) throw new Error('RESEND_FROM_EMAIL ortam değişkeni tanımlı değil.')

      const { error } = await new Resend(apiKey).emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
        })),
      })
      if (error) throw new Error(`E-posta gönderilemedi: ${error.message}`)
    },
  }
}
