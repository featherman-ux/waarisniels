// src/lib/mail.ts
// Dunne wrapper om Resend. Geen SDK: dat is één fetch, en een extra dependency
// in een Worker is het niet waard.
//
// Nodig als secret in Cloudflare (Workers & Pages → Settings → Variables):
//   RESEND_API_KEY   re_...
//   MAIL_FROM        Niels <post@waarisniels.nl>   (domein geverifieerd bij Resend)

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';

/** Resend accepteert maximaal 100 mails per batch-aanroep. */
export const BATCH_SIZE = 100;

export interface MailEnv {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Komt in de List-Unsubscribe-header; mailclients tonen dan hun eigen knop. */
  unsubscribeUrl?: string;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super('RESEND_API_KEY of MAIL_FROM ontbreekt — zie docs/cloudflare-setup.md');
    this.name = 'MailNotConfiguredError';
  }
}

function headersFor(mail: Mail): Record<string, string> | undefined {
  if (!mail.unsubscribeUrl) return undefined;
  return {
    'List-Unsubscribe': `<${mail.unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function payload(mail: Mail, from: string) {
  return {
    from,
    to: [mail.to],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: headersFor(mail),
  };
}

export async function sendMail(env: MailEnv, mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new MailNotConfiguredError();

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload(mail, env.MAIL_FROM)),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend gaf ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * Verstuurt in blokken van honderd. Retourneert per blok of het lukte, zodat
 * één mislukt blok de rest niet tegenhoudt — bij een nieuwe post is
 * "de meeste mensen hebben 'm" beter dan "niemand heeft 'm".
 */
export async function sendBatch(
  env: MailEnv,
  mails: Mail[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new MailNotConfiguredError();

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < mails.length; i += BATCH_SIZE) {
    const chunk = mails.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(RESEND_BATCH_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk.map((m) => payload(m, env.MAIL_FROM!))),
      });

      if (res.ok) {
        sent += chunk.length;
      } else {
        failed += chunk.length;
        errors.push(`${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      }
    } catch (error) {
      failed += chunk.length;
      errors.push(String(error).slice(0, 200));
    }
  }

  return { sent, failed, errors };
}

// ------------------------------------------------------------------ templates

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Bewust sober: één kolom, systeemletters, geen afbeeldingen behalve de cover.
 * Mailclients slopen toch alles wat ingewikkelder is, en dit rendert overal.
 */
function shell(bodyHtml: string, footerHtml: string): string {
  return `<!doctype html>
<html lang="nl"><body style="margin:0;background:#f5f5f7;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14181b;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 24px;">
    ${bodyHtml}
  </div>
  <div style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#5f5f63;text-align:center;">
    ${footerHtml}
  </div>
</body></html>`;
}

export function confirmMail(confirmUrl: string): Pick<Mail, 'subject' | 'html' | 'text'> {
  const url = escapeHtml(confirmUrl);
  return {
    subject: 'Bevestig je aanmelding voor WaarIsNiels',
    html: shell(
      `<h1 style="margin:0 0 12px;font-size:20px;">Nog één klik</h1>
       <p style="margin:0 0 16px;line-height:1.6;">
         Je krijgt een mailtje van me zodra er een nieuwe post op waarisniels.nl staat.
         Klik op de knop om te bevestigen dat jij dit was.
       </p>
       <p style="margin:0 0 20px;">
         <a href="${url}" style="display:inline-block;background:#14181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600;">Ja, meld me aan</a>
       </p>
       <p style="margin:0;font-size:13px;color:#5f5f63;line-height:1.6;">
         Werkt de knop niet? Plak deze link in je browser:<br>${url}
       </p>`,
      'Heb jij je niet aangemeld? Dan hoef je niks te doen — zonder bevestiging gebeurt er niets.'
    ),
    text: `Bevestig je aanmelding voor WaarIsNiels.\n\nJe krijgt een mailtje zodra er een nieuwe post staat. Bevestig via:\n${confirmUrl}\n\nHeb jij je niet aangemeld? Dan hoef je niks te doen.`,
  };
}

export interface NewPostMailInput {
  title: string;
  description: string | null;
  url: string;
  coverUrl?: string | null;
  readMinutes: number;
}

export function newPostMail(
  post: NewPostMailInput,
  unsubscribeUrl: string
): Pick<Mail, 'subject' | 'html' | 'text'> {
  const title = escapeHtml(post.title);
  const url = escapeHtml(post.url);
  const unsub = escapeHtml(unsubscribeUrl);
  const intro = post.description ? escapeHtml(post.description) : '';
  const cover = post.coverUrl
    ? `<img src="${escapeHtml(post.coverUrl)}" alt="" width="472" style="width:100%;height:auto;border-radius:12px;margin:0 0 18px;display:block;">`
    : '';

  return {
    subject: `Nieuwe post: ${post.title}`,
    html: shell(
      `${cover}
       <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;">${title}</h1>
       ${intro ? `<p style="margin:0 0 16px;line-height:1.6;">${intro}</p>` : ''}
       <p style="margin:0 0 20px;font-size:13px;color:#5f5f63;">${post.readMinutes} min lezen</p>
       <p style="margin:0;">
         <a href="${url}" style="display:inline-block;background:#14181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:600;">Lees de post</a>
       </p>`,
      `Je krijgt dit omdat je je hebt aangemeld op waarisniels.nl.<br>
       <a href="${unsub}" style="color:#5f5f63;">Afmelden</a>`
    ),
    text: `Nieuwe post op WaarIsNiels: ${post.title}\n\n${post.description ?? ''}\n\nLezen: ${post.url}\n\nAfmelden: ${unsubscribeUrl}`,
  };
}
