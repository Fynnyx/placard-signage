import { and, eq } from 'drizzle-orm'
import nodemailer, { type Transporter } from 'nodemailer'

let transport: Transporter | undefined

export function mailEnabled() {
  return !!useConfig().smtpUrl
}

export async function sendMail(to: string[], subject: string, text: string) {
  const cfg = useConfig()
  if (!cfg.smtpUrl || !to.length) return
  transport ??= nodemailer.createTransport(cfg.smtpUrl)
  try {
    await transport.sendMail({ from: cfg.smtpFrom, to: to.join(', '), subject, text })
  }
  catch (err) {
    log('error', 'Sending mail failed', { error: String(err) })
  }
}

export function adminEmails() {
  return useDb().select({ email: schema.users.email }).from(schema.users)
    .where(and(eq(schema.users.role, 'admin'), eq(schema.users.disabled, false))).all()
    .map(u => u.email)
}
