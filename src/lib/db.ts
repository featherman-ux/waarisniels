// src/lib/db.ts
// Alle D1-toegang loopt hier langs. Frontend-pagina's importeren deze functies
// i.p.v. astro:content.

export type MediaItem =
  | { type: 'photo'; key: string; alt?: string; w?: number; h?: number }
  | { type: 'video'; key: string; poster?: string; alt?: string }
  | { type: 'youtube'; id: string; alt?: string };

export interface PostLocation {
  lat: number;
  lon: number;
  name: string | null;
}

export interface Post {
  id: string;
  category: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  pubDate: Date;
  tags: string[];
  location: PostLocation | null;
  media: MediaItem[];
  cover: { key: string; alt: string | null } | null;
  placeFact: string | null;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  slug: string;
  label: string;
  sort: number;
}

interface PostRow {
  id: string;
  category: string;
  title: string;
  slug: string;
  description: string | null;
  body: string;
  pub_date: string;
  tags: string | null;
  loc_lat: number | null;
  loc_lon: number | null;
  loc_name: string | null;
  media: string | null;
  cover_key: string | null;
  cover_alt: string | null;
  place_fact: string | null;
  draft: number;
  created_at: string;
  updated_at: string;
}

const POST_COLUMNS = `id, category, title, slug, description, body, pub_date, tags,
  loc_lat, loc_lon, loc_name, media, cover_key, cover_alt, place_fact, draft,
  created_at, updated_at`;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn('[db] onleesbare JSON-kolom, fallback gebruikt');
    return fallback;
  }
}

function mapRow(row: PostRow): Post {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    slug: row.slug,
    description: row.description,
    body: row.body,
    pubDate: new Date(row.pub_date),
    tags: parseJson<string[]>(row.tags, []),
    location:
      row.loc_lat !== null && row.loc_lon !== null
        ? { lat: row.loc_lat, lon: row.loc_lon, name: row.loc_name }
        : null,
    media: parseJson<MediaItem[]>(row.media, []),
    cover: row.cover_key ? { key: row.cover_key, alt: row.cover_alt } : null,
    placeFact: row.place_fact,
    draft: row.draft === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------- lezen

export interface ListOptions {
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
  includeDrafts?: boolean;
}

export async function listPosts(db: D1Database, opts: ListOptions = {}): Promise<Post[]> {
  const { category, tag, limit = 50, offset = 0, includeDrafts = false } = opts;

  const where: string[] = [];
  const binds: unknown[] = [];

  if (!includeDrafts) where.push('draft = 0');
  if (category) {
    where.push('category = ?');
    binds.push(category);
  }
  if (tag) {
    // tags is een JSON-array; LIKE op de geserialiseerde vorm is voor deze
    // hoeveelheid posts ruim snel genoeg.
    where.push('tags LIKE ?');
    binds.push(`%"${tag}"%`);
  }

  const sql = `SELECT ${POST_COLUMNS} FROM posts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY pub_date DESC LIMIT ? OFFSET ?`;

  const { results } = await db
    .prepare(sql)
    .bind(...binds, limit, offset)
    .all<PostRow>();

  return (results ?? []).map(mapRow);
}

export async function countPosts(
  db: D1Database,
  opts: Pick<ListOptions, 'category' | 'includeDrafts'> = {}
): Promise<number> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (!opts.includeDrafts) where.push('draft = 0');
  if (opts.category) {
    where.push('category = ?');
    binds.push(opts.category);
  }
  const sql = `SELECT COUNT(*) AS n FROM posts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getPostBySlug(
  db: D1Database,
  slug: string,
  includeDrafts = false
): Promise<Post | null> {
  const sql = `SELECT ${POST_COLUMNS} FROM posts WHERE slug = ?${includeDrafts ? '' : ' AND draft = 0'}`;
  const row = await db.prepare(sql).bind(slug).first<PostRow>();
  return row ? mapRow(row) : null;
}

export async function getPostById(db: D1Database, id: string): Promise<Post | null> {
  const row = await db
    .prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ?`)
    .bind(id)
    .first<PostRow>();
  return row ? mapRow(row) : null;
}

/** Voor "Lees ook": posts met overlappende tags, aangevuld met de nieuwste. */
export async function getRelatedPosts(
  db: D1Database,
  post: Post,
  limit = 2
): Promise<Post[]> {
  const candidates = await listPosts(db, { limit: 30 });
  const others = candidates.filter((p) => p.id !== post.id);

  const scored = others
    .map((p) => ({ p, shared: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort(
      (a, b) => b.shared - a.shared || b.p.pubDate.getTime() - a.p.pubDate.getTime()
    );

  return scored.slice(0, limit).map((s) => s.p);
}

/** Posts met een locatie, voor de kaart. */
export async function getPostsWithLocation(db: D1Database): Promise<Post[]> {
  const { results } = await db
    .prepare(
      `SELECT ${POST_COLUMNS} FROM posts
       WHERE draft = 0 AND loc_lat IS NOT NULL AND loc_lon IS NOT NULL
       ORDER BY pub_date ASC`
    )
    .all<PostRow>();
  return (results ?? []).map(mapRow);
}

/** Nieuwste post met locatie, voor het "Waar is Niels nu"-blokje. */
export async function getLatestLocatedPost(db: D1Database): Promise<Post | null> {
  const row = await db
    .prepare(
      `SELECT ${POST_COLUMNS} FROM posts
       WHERE draft = 0 AND loc_lat IS NOT NULL AND loc_lon IS NOT NULL
       ORDER BY pub_date DESC LIMIT 1`
    )
    .first<PostRow>();
  return row ? mapRow(row) : null;
}

export async function listCategories(db: D1Database): Promise<Category[]> {
  const { results } = await db
    .prepare('SELECT slug, label, sort FROM categories ORDER BY sort ASC, label ASC')
    .all<Category>();
  return results ?? [];
}

// ---------------------------------------------------------------- schrijven

export interface PostInput {
  id?: string;
  category: string;
  title: string;
  slug: string;
  description?: string | null;
  body: string;
  pubDate: Date | string;
  tags?: string[];
  location?: PostLocation | null;
  media?: MediaItem[];
  cover?: { key: string; alt?: string | null } | null;
  placeFact?: string | null;
  draft?: boolean;
}

export async function upsertPost(db: D1Database, input: PostInput): Promise<string> {
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();
  const pubDate =
    input.pubDate instanceof Date
      ? input.pubDate.toISOString()
      : new Date(input.pubDate).toISOString();

  await db
    .prepare(
      `INSERT INTO posts (id, category, title, slug, description, body, pub_date, tags,
         loc_lat, loc_lon, loc_name, media, cover_key, cover_alt, place_fact, draft,
         created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17)
       ON CONFLICT(id) DO UPDATE SET
         category = ?2, title = ?3, slug = ?4, description = ?5, body = ?6,
         pub_date = ?7, tags = ?8, loc_lat = ?9, loc_lon = ?10, loc_name = ?11,
         media = ?12, cover_key = ?13, cover_alt = ?14, place_fact = ?15,
         draft = ?16, updated_at = ?17`
    )
    .bind(
      id,
      input.category,
      input.title,
      input.slug,
      input.description ?? null,
      input.body,
      pubDate,
      JSON.stringify(input.tags ?? []),
      input.location?.lat ?? null,
      input.location?.lon ?? null,
      input.location?.name ?? null,
      JSON.stringify(input.media ?? []),
      input.cover?.key ?? null,
      input.cover?.alt ?? null,
      input.placeFact ?? null,
      input.draft ? 1 : 0,
      now
    )
    .run();

  return id;
}

export async function setPlaceFact(db: D1Database, id: string, fact: string): Promise<void> {
  await db
    .prepare('UPDATE posts SET place_fact = ?, updated_at = ? WHERE id = ?')
    .bind(fact, new Date().toISOString(), id)
    .run();
}

export async function deletePost(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
}

// ---------------------------------------------------------------- slugs

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // accenten weg: Máncora -> Mancora
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

export async function slugTaken(
  db: D1Database,
  slug: string,
  exceptId?: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM posts WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>();
  return !!row && row.id !== exceptId;
}

/** Voegt -2, -3, ... toe tot de slug vrij is. */
export async function uniqueSlug(
  db: D1Database,
  base: string,
  exceptId?: string
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 2;
  while (await slugTaken(db, candidate, exceptId)) {
    candidate = `${root}-${n++}`;
    if (n > 50) return `${root}-${Date.now()}`;
  }
  return candidate;
}
