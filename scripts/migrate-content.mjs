#!/usr/bin/env node
/**
 * migrate-content.mjs
 * ---------------------------------------------------------------------------
 * Zet de bestaande Content-Collection-posts om naar:
 *   1. scripts/out/0002_seed_posts.sql   -> uitvoeren met wrangler d1 execute
 *   2. scripts/out/upload-media.sh       -> uploadt public/images/** naar R2
 *   3. scripts/out/key-map.json          -> oud pad -> nieuwe R2-key
 *   4. scripts/out/report.md             -> controleerbaar verslag
 *
 * Het script praat zelf NIET met Cloudflare: het genereert alleen. Zo kun je
 * eerst het rapport lezen en daarna pas iets uitvoeren.
 *
 * Gebruik:  node scripts/migrate-content.mjs
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const OUT_DIR = path.join(ROOT, 'scripts', 'out');

const BUCKET = 'waarisniels-media';
const MEDIA_BASE = 'https://media.waarisniels.nl';
const DEFAULT_CATEGORY = 'reis';

/**
 * Site-chrome: wordt door .astro-pagina's via /images/... gebruikt en blijft dus
 * in public/ (en in git) staan. Keys hieronder zijn de geslugde vorm.
 */
const KEEP_IN_REPO = new Set([
  'images/homepage.jpeg',
  'images/niels.jpg',
  'images/over.jpg',
  'images/marker-icon.png',
  'images/marker-icon-2x.png',
  'images/marker-shadow.png',
]);

/** Mapnamen die we overslaan (dubbele post, zie plan §1). */
const SKIP_ENTRIES = new Set(['aftermovie-santa-cruz']);

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  avif: 'image/avif', gif: 'image/gif', heic: 'image/heic', svg: 'image/svg+xml',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
};

// --------------------------------------------------------------- helpers

function slugSegment(segment) {
  return segment
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-*\.-*/g, '.')
    .replace(/^-+|-+$/g, '');
}

/** public/images/Santa Cruz/bergen.webp -> images/santa-cruz/bergen.webp */
function keyForRelPath(relPath) {
  const parts = relPath.split(path.sep).filter(Boolean);
  return ['images', ...parts.map(slugSegment)].join('/');
}

async function walk(dir, base = dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else if (e.name !== '.DS_Store') out.push(path.relative(base, full));
  }
  return out;
}

function sqlStr(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3] ?? '').trim() : undefined;
}

function youtubeId(url) {
  const m =
    url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
    url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

/** Grove bijna-treffer: zelfde map, meeste overlappende woorden in de bestandsnaam. */
function nearestKey(missingWebPath, keys) {
  const missKey = ['images', ...missingWebPath.replace(/^\/images\//, '').split('/').map(slugSegment)].join('/');
  const dir = missKey.slice(0, missKey.lastIndexOf('/'));
  const words = new Set(path.basename(missKey, path.extname(missKey)).split('-').filter(Boolean));
  let best = null;
  let bestScore = 0;
  for (const k of keys) {
    if (!k.startsWith(dir + '/')) continue;
    const kw = path.basename(k, path.extname(k)).split('-').filter(Boolean);
    const score = kw.filter((w) => words.has(w)).length / Math.max(words.size, kw.length);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return bestScore >= 0.4 ? `\`${best}\` (${Math.round(bestScore * 100)}%)` : null;
}

function decodeMaybe(p) {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

// --------------------------------------------------------------- main

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // 1. media-inventaris + keymap ------------------------------------------
  // Sorteer zo dat bestanden die géén naamopschoning nodig hebben vóór hun
  // vervuilde naamgenoten komen ("bergen.webp" wint van "bergen .webp"), anders
  // krijgt de post-afbeelding onnodig een -2 achter de naam.
  const needsClean = (rel) => {
    const base = path.basename(rel);
    return slugSegment(base) === base.toLowerCase() ? 0 : 1;
  };
  const imageFiles = (await walk(IMAGES_DIR)).sort(
    (a, b) => needsClean(a) - needsClean(b) || a.localeCompare(b)
  );
  if (!imageFiles.length) {
    console.error(`Geen bestanden gevonden in ${IMAGES_DIR}`);
    process.exit(1);
  }

  const keyMap = new Map();   // oud webpad (/images/...) -> nieuwe R2-key
  const keyToRel = new Map(); // nieuwe key -> relatief pad op schijf
  const collisions = [];

  for (const rel of imageFiles) {
    const webPath = `/images/${rel.split(path.sep).join('/')}`;
    let key = keyForRelPath(rel);
    if (keyToRel.has(key) && keyToRel.get(key) !== rel) {
      const ext = path.extname(key);
      let n = 2;
      let candidate = `${key.slice(0, -ext.length)}-${n}${ext}`;
      while (keyToRel.has(candidate)) candidate = `${key.slice(0, -ext.length)}-${++n}${ext}`;
      collisions.push({ from: webPath, key, resolved: candidate });
      key = candidate;
    }
    keyMap.set(webPath, key);
    keyMap.set(encodeURI(webPath), key);
    keyToRel.set(key, rel);
  }

  // 2. posts inlezen -------------------------------------------------------
  const entries = await readdir(BLOG_DIR, { withFileTypes: true });
  const postFiles = [];
  const skipped = [];

  for (const e of entries) {
    if (e.isDirectory()) {
      skipped.push(`${e.name}/ (map overgeslagen${SKIP_ENTRIES.has(e.name) ? ', dubbel met ' + e.name + '.mdx' : ''})`);
      continue;
    }
    if (!/\.mdx?$/i.test(e.name)) continue;
    postFiles.push(e.name);
  }
  postFiles.sort();

  const posts = [];
  const missingMedia = [];
  const usedKeys = new Set();

  for (const file of postFiles) {
    const raw = await readFile(path.join(BLOG_DIR, file), 'utf8');
    const { data: fm, content } = matter(raw);
    const slug = fm.slug?.trim() || file.replace(/\.mdx?$/i, '');

    // -- media uit de body halen
    const media = [];
    const seen = new Set();

    const resolveKey = (src, where) => {
      if (!src) return null;
      if (/^https?:\/\//i.test(src)) return null;             // extern
      const clean = src.split('#')[0].split('?')[0];
      const key = keyMap.get(clean) ?? keyMap.get(decodeMaybe(clean)) ?? keyMap.get(encodeURI(decodeMaybe(clean)));
      if (!key) {
        missingMedia.push({ slug, src: clean, where });
        return null;
      }
      usedKeys.add(key);
      return key;
    };

    for (const tag of content.match(/<img\b[^>]*>/gi) ?? []) {
      const key = resolveKey(attr(tag, 'src'), 'img');
      if (key && !seen.has(key)) {
        seen.add(key);
        media.push({ type: 'photo', key, alt: attr(tag, 'alt') || '' });
      }
    }

    for (const tag of content.match(/<video\b[\s\S]*?<\/video>/gi) ?? []) {
      const posterKey = resolveKey(attr(tag, 'poster'), 'video poster');
      const sourceTag = tag.match(/<source\b[^>]*>/i)?.[0] ?? '';
      const key = resolveKey(attr(sourceTag, 'src') ?? attr(tag, 'src'), 'video');
      if (key && !seen.has(key)) {
        seen.add(key);
        media.push({
          type: 'video',
          key,
          ...(posterKey ? { poster: posterKey } : {}),
          alt: attr(tag, 'title') || '',
        });
      }
    }

    for (const tag of content.match(/<iframe\b[^>]*>/gi) ?? []) {
      const src = attr(tag, 'src') ?? '';
      const id = youtubeId(src);
      if (id && !seen.has(`yt:${id}`)) {
        seen.add(`yt:${id}`);
        media.push({ type: 'youtube', id, alt: attr(tag, 'title') || '' });
      }
    }

    // markdown-plaatjes ![alt](/images/..)
    for (const m of content.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) {
      const key = resolveKey(m[2], 'markdown image');
      if (key && !seen.has(key)) {
        seen.add(key);
        media.push({ type: 'photo', key, alt: m[1] || '' });
      }
    }

    // -- body herschrijven: /images/... -> https://media.waarisniels.nl/...
    let body = content;
    const paths = [...new Set([...keyMap.keys()])].sort((a, b) => b.length - a.length);
    for (const oldPath of paths) {
      if (!body.includes(oldPath)) continue;
      const key = keyMap.get(oldPath);
      body = body.split(oldPath).join(`${MEDIA_BASE}/${encodeURI(key)}`);
    }

    // Verwijzingen zonder bestand: tag eruit, spoor achterlaten als commentaar.
    // Anders staat er na het weghalen van public/images een gebroken plaatje.
    for (const miss of missingMedia.filter((m) => m.slug === slug)) {
      const escaped = miss.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      body = body.replace(
        new RegExp(`\\s*<img\\b[^>]*${escaped}[^>]*>`, 'gi'),
        `\n  <!-- ontbrekend bestand, opnieuw uploaden via /beheer: ${miss.src} -->`
      );
    }

    const leftovers = [...body.matchAll(/["'(](\/images\/[^"')\s]+)/g)].map((m) => m[1]);

    // -- cover
    let coverKey = null;
    let coverAlt = null;
    if (fm.image?.url) {
      coverKey = resolveKey(fm.image.url, 'frontmatter image');
      coverAlt = fm.image.alt ?? null;
    }
    if (!coverKey) {
      const firstPhoto = media.find((m) => m.type === 'photo');
      if (firstPhoto) {
        coverKey = firstPhoto.key;
        coverAlt = firstPhoto.alt || null;
      }
    }

    const pubDate =
      fm.pubDate instanceof Date
        ? fm.pubDate.toISOString()
        : new Date(String(fm.pubDate)).toISOString();

    posts.push({
      id: randomUUID(),
      file,
      slug,
      category: fm.category ?? DEFAULT_CATEGORY,
      title: String(fm.title ?? slug).trim(),
      description: fm.description ?? null,
      body: body.trim(),
      pubDate,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      media,
      coverKey,
      coverAlt,
      draft: fm.draft === true,
      leftovers,
    });
  }

  // 3. SQL ----------------------------------------------------------------
  const now = new Date().toISOString();
  const sql = [
    '-- Gegenereerd door scripts/migrate-content.mjs',
    `-- ${now}`,
    '-- Uitvoeren: npx wrangler d1 execute waarisniels-db --remote --file=scripts/out/0002_seed_posts.sql',
    '',
    'DELETE FROM posts;',
    '',
  ];

  for (const p of posts) {
    sql.push(
      `INSERT INTO posts (id, category, title, slug, description, body, pub_date, tags,
  loc_lat, loc_lon, loc_name, media, cover_key, cover_alt, place_fact, draft, created_at, updated_at)
VALUES (${sqlStr(p.id)}, ${sqlStr(p.category)}, ${sqlStr(p.title)}, ${sqlStr(p.slug)},
  ${sqlStr(p.description)}, ${sqlStr(p.body)}, ${sqlStr(p.pubDate)}, ${sqlStr(JSON.stringify(p.tags))},
  NULL, NULL, NULL, ${sqlStr(JSON.stringify(p.media))}, ${sqlStr(p.coverKey)}, ${sqlStr(p.coverAlt)},
  NULL, ${p.draft ? 1 : 0}, ${sqlStr(now)}, ${sqlStr(now)});`,
      ''
    );
  }
  await writeFile(path.join(OUT_DIR, '0002_seed_posts.sql'), sql.join('\n'), 'utf8');

  // 4. upload-script -------------------------------------------------------
  const sh = [
    '#!/usr/bin/env bash',
    '# Gegenereerd door scripts/migrate-content.mjs',
    '# Uploadt public/images/** naar R2. Idempotent: opnieuw draaien overschrijft.',
    'set -uo pipefail',
    'cd "$(dirname "$0")/../.."',
    'fail=0',
    '',
  ];
  let n = 0;
  for (const [key, rel] of [...keyToRel.entries()].sort()) {
    const localPath = `public/images/${rel.split(path.sep).join('/')}`;
    const ext = path.extname(key).slice(1).toLowerCase();
    const ct = MIME[ext] ?? 'application/octet-stream';
    n += 1;
    sh.push(
      `echo "[${n}/${keyToRel.size}] ${key}"`,
      `npx wrangler r2 object put "${BUCKET}/${key}" --file "${localPath}" --content-type "${ct}" --remote || fail=$((fail+1))`
    );
  }
  sh.push(
    '',
    'if [ "$fail" -gt 0 ]; then echo "KLAAR met $fail fouten"; exit 1; fi',
    'echo "Alle bestanden geupload."'
  );
  await writeFile(path.join(OUT_DIR, 'upload-media.sh'), sh.join('\n') + '\n', 'utf8');

  // 5. keymap + rapport ----------------------------------------------------
  await writeFile(
    path.join(OUT_DIR, 'key-map.json'),
    JSON.stringify(
      {
        generated: now,
        bucket: BUCKET,
        mediaBase: MEDIA_BASE,
        map: Object.fromEntries([...keyMap.entries()].filter(([k]) => !k.includes('%'))),
      },
      null,
      2
    ),
    'utf8'
  );

  const unused = [...keyToRel.keys()].filter((k) => !usedKeys.has(k));
  const report = [
    '# Migratierapport',
    '',
    `Gegenereerd: ${now}`,
    '',
    `- Posts: **${posts.length}**`,
    `- Mediabestanden in public/images: **${keyToRel.size}**`,
    `- Waarvan gebruikt in een post: **${usedKeys.size}**`,
    `- Ontbrekende media (verwijzing zonder bestand): **${missingMedia.length}**`,
    `- Key-botsingen na naamopschoning: **${collisions.length}**`,
    '',
    '## Posts',
    '',
    '| slug | titel | datum | tags | media | cover | concept |',
    '|---|---|---|---|---|---|---|',
    ...posts.map(
      (p) =>
        `| \`${p.slug}\` | ${p.title.replace(/\|/g, '\\|')} | ${p.pubDate.slice(0, 10)} | ${p.tags.join(', ')} | ${p.media.length} (${
          p.media.filter((m) => m.type === 'photo').length
        }f/${p.media.filter((m) => m.type === 'video').length}v/${p.media.filter((m) => m.type === 'youtube').length}yt) | ${
          p.coverKey ? '✓' : '**geen**'
        } | ${p.draft ? 'ja' : 'nee'} |`
    ),
    '',
    '## URL-check (moeten identiek blijven)',
    '',
    ...posts.map((p) => `- https://waarisniels.nl/blog/${p.slug}/`),
    '',
  ];

  if (missingMedia.length) {
    report.push(
      '## ⚠ Ontbrekende media',
      '',
      'Deze verwijzingen staan in de posts maar het bestand bestaat niet in `public/images/`.',
      'Dat is nu al een gebroken afbeelding op de live site.',
      '',
      'De `<img>` is uit de body gehaald en vervangen door een HTML-commentaar, zodat er',
      'geen kapot plaatje op de nieuwe site staat. Bijna-treffer = mijn gok op het bedoelde bestand.',
      '',
      '| post | verwijzing | plek | bijna-treffer in public/images |',
      '|---|---|---|---|',
      ...missingMedia.map(
        (m) => `| \`${m.slug}\` | \`${m.src}\` | ${m.where} | ${nearestKey(m.src, [...keyToRel.keys()]) ?? '—'} |`
      ),
      ''
    );
  }

  const withLeftovers = posts.filter((p) => p.leftovers.length);
  if (withLeftovers.length) {
    report.push(
      '## ⚠ Niet-herschreven /images/-paden',
      '',
      ...withLeftovers.map((p) => `- \`${p.slug}\`: ${p.leftovers.join(', ')}`),
      ''
    );
  }

  if (collisions.length) {
    report.push(
      '## Key-botsingen',
      '',
      ...collisions.map((c) => `- \`${c.from}\` → \`${c.resolved}\` (in plaats van \`${c.key}\`)`),
      ''
    );
  }

  if (skipped.length) {
    report.push('## Overgeslagen', '', ...skipped.map((s) => `- ${s}`), '');
  }

  report.push(
    '## Ongebruikte media',
    '',
    'Staan in `public/images/` maar worden door geen enkele post genoemd. Gaan wel mee naar R2',
    '(niets kwijt), maar mogen bij stap 4 uit de git-repo. De site-chrome hieronder blijft juist',
    'wél in de repo staan omdat `.astro`-pagina\'s ze via `/images/...` gebruiken.',
    '',
    ...unused.map((k) => `- \`${k}\`${KEEP_IN_REPO.has(k) ? ' — **site-chrome, houden in repo**' : ''}`),
    '',
    '## Volgende stappen',
    '',
    '```bash',
    'bash scripts/out/upload-media.sh                     # media naar R2 (~5 min)',
    'npx wrangler d1 execute waarisniels-db --remote --file=scripts/out/0002_seed_posts.sql',
    'npm run db:query "SELECT slug, title, json_array_length(media) AS media FROM posts ORDER BY pub_date DESC"',
    '```',
    ''
  );

  await writeFile(path.join(OUT_DIR, 'report.md'), report.join('\n'), 'utf8');

  console.log(`✓ ${posts.length} posts, ${keyToRel.size} mediabestanden`);
  console.log(`  missing media: ${missingMedia.length}, leftovers: ${withLeftovers.length}, collisions: ${collisions.length}`);
  console.log(`  output: scripts/out/{0002_seed_posts.sql,upload-media.sh,key-map.json,report.md}`);
  if (missingMedia.length || withLeftovers.length) {
    console.log('  ⚠ lees scripts/out/report.md voor de waarschuwingen');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
