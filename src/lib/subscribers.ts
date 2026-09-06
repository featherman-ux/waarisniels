// src/lib/subscribers.ts
// Alles wat met de mailinglijst te maken heeft, op één plek — net als db.ts
// voor de posts. Zie migrations/0002_subscribers.sql.

export type SubscriberStatus = 'pending' | 'confirmed' | 'unsubscribed';

export interface Subscriber {
  email: string;
  status: SubscriberStatus;
  confirmToken: string;
  unsubscribeToken: string;
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  source: string | null;
}

interface SubscriberRow {
  email: string;
  status: SubscriberStatus;
  confirm_token: string;
  unsubscribe_token: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  source: string | null;
}

const COLUMNS = `email, status, confirm_token, unsubscribe_token, created_at,
  confirmed_at, unsubscribed_at, source`;

function mapRow(row: SubscriberRow): Subscriber {
  return {
    email: row.email,
    status: row.status,
    confirmToken: row.confirm_token,
    unsubscribeToken: row.unsubscribe_token,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    unsubscribedAt: row.unsubscribed_at,
    source: row.source,
  };
}

/**
 * Bewust simpel: één @, iets ervoor, een punt erna. Alles strenger dan dit
 * weigert vroeg of laat een geldig adres, en de bevestigingsmail is toch de
 * echte controle.
 */
export function isValidEmail(input: string): boolean {
  const email = input.trim();
  if (email.length < 6 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Aanmelden of opnieuw aanmelden. Levert altijd een verse bevestigingstoken op,
 * ook voor iemand die zich eerder afmeldde — anders kan zo iemand nooit meer terug.
 * Retourneert null als het adres al bevestigd is: dan hoeft er niets gemaild.
 */
export async function startSubscription(
  db: D1Database,
  email: string,
  source: string | null
): Promise<{ subscriber: Subscriber; alreadyConfirmed: boolean }> {
  const now = new Date().toISOString();
  const existing = await getByEmail(db, email);

  if (existing?.status === 'confirmed') {
    return { subscriber: existing, alreadyConfirmed: true };
  }

  const confirmToken = crypto.randomUUID();
  const unsubscribeToken = existing?.unsubscribeToken ?? crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO subscribers
         (email, status, confirm_token, unsubscribe_token, created_at, source)
       VALUES (?1, 'pending', ?2, ?3, ?4, ?5)
       ON CONFLICT(email) DO UPDATE SET
         status = 'pending',
         confirm_token = ?2,
         unsubscribed_at = NULL,
         source = ?5`
    )
    .bind(email, confirmToken, unsubscribeToken, now, source)
    .run();

  const subscriber = await getByEmail(db, email);
  if (!subscriber) throw new Error('Aanmelding niet teruggevonden na opslaan');
  return { subscriber, alreadyConfirmed: false };
}

export async function getByEmail(db: D1Database, email: string): Promise<Subscriber | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM subscribers WHERE email = ?`)
    .bind(email)
    .first<SubscriberRow>();
  return row ? mapRow(row) : null;
}

/** Bevestigt een aanmelding. Idempotent: twee keer klikken is geen fout. */
export async function confirmByToken(
  db: D1Database,
  token: string
): Promise<Subscriber | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM subscribers WHERE confirm_token = ?`)
    .bind(token)
    .first<SubscriberRow>();
  if (!row) return null;

  if (row.status !== 'confirmed') {
    await db
      .prepare(
        `UPDATE subscribers SET status = 'confirmed', confirmed_at = ?, unsubscribed_at = NULL
         WHERE email = ?`
      )
      .bind(new Date().toISOString(), row.email)
      .run();
  }

  return getByEmail(db, row.email);
}

/** Afmelden via de link onderaan elke mail. Ook idempotent. */
export async function unsubscribeByToken(
  db: D1Database,
  token: string
): Promise<Subscriber | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM subscribers WHERE unsubscribe_token = ?`)
    .bind(token)
    .first<SubscriberRow>();
  if (!row) return null;

  if (row.status !== 'unsubscribed') {
    await db
      .prepare(
        `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE email = ?`
      )
      .bind(new Date().toISOString(), row.email)
      .run();
  }

  return getByEmail(db, row.email);
}

export async function listConfirmed(db: D1Database): Promise<Subscriber[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM subscribers WHERE status = 'confirmed' ORDER BY confirmed_at ASC`)
    .all<SubscriberRow>();
  return (results ?? []).map(mapRow);
}

export async function countByStatus(db: D1Database): Promise<Record<SubscriberStatus, number>> {
  const { results } = await db
    .prepare('SELECT status, COUNT(*) AS n FROM subscribers GROUP BY status')
    .all<{ status: SubscriberStatus; n: number }>();
  const counts: Record<SubscriberStatus, number> = {
    pending: 0,
    confirmed: 0,
    unsubscribed: 0,
  };
  for (const row of results ?? []) counts[row.status] = row.n;
  return counts;
}

// ------------------------------------------------- verzendlog per post

export async function wasNotified(db: D1Database, slug: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT slug FROM post_notifications WHERE slug = ?')
    .bind(slug)
    .first<{ slug: string }>();
  return !!row;
}

export async function markNotified(
  db: D1Database,
  slug: string,
  recipients: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO post_notifications (slug, sent_at, recipients) VALUES (?1, ?2, ?3)
       ON CONFLICT(slug) DO UPDATE SET sent_at = ?2, recipients = ?3`
    )
    .bind(slug, new Date().toISOString(), recipients)
    .run();
}
