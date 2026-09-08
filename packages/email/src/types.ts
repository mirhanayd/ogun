export interface EmailAttachment {
  filename: string
  contentType: string
  content: Buffer
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  attachments?: EmailAttachment[]
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<void>
}
