# Cloudflare-setup voor waarisniels.nl

Alles wat **buiten de code** moet gebeuren. Kopieer-plak de commando's in je terminal,
in de map van dit project, op de branch `rebuild/d1-r2`.

Kosten van dit hele setje: **€0/maand** (D1 gratis t/m 5 GB, R2 gratis t/m 10 GB zonder
egresskosten, Pages/Workers 100k requests/dag, Workers AI dagelijks gratis quotum,
Access gratis t/m 50 gebruikers).

---

## 0. Eenmalig: inloggen + dependencies

```bash
# node_modules is vervuild met iCloud-duplicaten ("path-scurry 2" etc.) -> schoon opnieuw
rm -rf node_modules .astro dist
npm install
npx wrangler --version      # moet een versienummer geven, geen workerd-fout
npx wrangler login          # opent je browser, kies het account van waarisniels.nl
npx wrangler whoami         # check: juist account?
```

Werkt `npm install` nog niet, dan ook de lockfile weg:

```bash
rm -rf node_modules package-lock.json .astro dist && npm install
```

## 1. D1-database aanmaken

```bash
npx wrangler d1 create waarisniels-db
```

Uitvoer eindigt met een `database_id`. Zet die in **`wrangler.toml`** op de plek van
`PLAK_HIER_DE_DATABASE_ID`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "waarisniels-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Dan het schema erin:

```bash
npm run db:migrate                  # remote (de echte database)
npm run db:migrate:local            # lokaal, voor wrangler dev
```

Controle:

```bash
npm run db:query "SELECT slug, label FROM categories"
```

Verwacht: `reis / Reisverhaal` en `overig / Overig`.

> Let op: `0001_init.sql` begint met `DROP TABLE IF EXISTS posts`. Zolang we in stap 1-2
> zitten is dat handig (opnieuw kunnen migreren), maar zodra er posts in D1 staan die je
> wilt houden, niet meer opnieuw uitvoeren. Vanaf dat moment doen we wijzigingen in een
> `0002_*.sql`.

## 2. R2-bucket aanmaken

```bash
npx wrangler r2 bucket create waarisniels-media --location weur
npx wrangler r2 bucket list
```

De binding staat al in `wrangler.toml` (`MEDIA` → `waarisniels-media`), daar hoef je niets
te doen.

De migratie van de bestaande 119 bestanden uit `public/images/` gebeurt straks (stap 2) met
`wrangler r2 object put` — dus **geen R2 API-tokens / S3-credentials nodig**, je
`wrangler login` is genoeg.

## 3. media.waarisniels.nl aankoppelen — dashboard

Dit kan wrangler niet, dit moet in het dashboard:

1. **dash.cloudflare.com → R2 → `waarisniels-media` → Settings**
2. **Public access → Custom domains → Connect domain**
3. Vul in: `media.waarisniels.nl` → *Continue* → *Connect domain*
   Cloudflare maakt de DNS-record zelf aan (waarisniels.nl staat al in dit account).
4. Wacht tot de status **Active** is (meestal < 1 min).

Controle, zodra er een bestand in de bucket staat:

```bash
curl -I https://media.waarisniels.nl/images/homepage.jpeg   # verwacht: 200
```

> Gebruik **niet** de `*.r2.dev`-URL die R2 ook aanbiedt: die is gerate-limit en niet voor
> productie bedoeld.

## 4. Bindings in het Pages-project — vervallen

~~Handmatig bindings zetten in het dashboard~~ — niet meer nodig. `.github/workflows/deploy.yml`
gebruikt nu `wrangler pages deploy` in plaats van `cloudflare/pages-action@v1`, en die leest
D1/R2/KV/AI-bindings rechtstreeks uit `wrangler.toml`. Eén bestand, één waarheid.

> Let op: `wrangler.toml` heeft geen `[env.preview]`-blok, dus preview-deployments (elke
> branch die niet `main` is) binden aan **dezelfde** productie-D1 en -R2 als main. Een
> preview-URL (`*.pages.dev`) met een onbeveiligde `/beheer` kan dus net zo goed echte
> posts aanmaken/verwijderen. Zie de achterdeur-waarschuwing in §5 — die geldt hierdoor
> dubbel zo hard.

## 5. Cloudflare Access op /beheer — dashboard

Dit is de beveiliging van de upload-pagina. Geen eigen wachtwoordsysteem.

1. **Zero Trust → Settings → Authentication → Login methods → Add new → Google**
   (de standaard Google-integratie is genoeg, geen eigen OAuth-client nodig).
2. **Zero Trust → Access → Applications → Add an application → Self-hosted**
   - Application name: `waarisniels-beheer`
   - Session duration: **1 month** (dan blijf je op je telefoon ingelogd)
   - Public hostname: domain `waarisniels.nl`, path `beheer`
3. **Policy**
   - Name: `alleen niels`
   - Action: **Allow**
   - Include → **Emails** → `sielvandenberg@gmail.com`
   - Selecteer Google als identity provider
4. **Tweede applicatie, zelfde policy**, met path `api/admin`.
   Zonder deze stap zijn de upload-endpoints publiek toegankelijk.
5. Test op je telefoon: `https://waarisniels.nl/beheer` → Google-login → pagina.
   In een incognitovenster met een ander account → geweigerd.

> **Achterdeur:** Access geldt voor `waarisniels.nl`, niet voor de
> `*.waarisniels.pages.dev`-URL's van Pages. Zet daarom een derde Access-app op
> `waarisniels.pages.dev` (path leeg = hele site), of schakel in het Pages-project
> *Settings → Builds → Preview deployments* de publieke previews uit.

## 5b. Migratie van de bestaande content

`scripts/migrate-content.mjs` praat zelf niet met Cloudflare: het leest
`src/content/blog/` + `public/images/` en schrijft vier bestanden in `scripts/out/`.
Eerst genereren en lezen, dan uitvoeren.

```bash
npm run migrate:content            # genereert scripts/out/*
open scripts/out/report.md         # LEES DIT EERST
```

Daarna pas echt uitvoeren:

```bash
# 1. droogloop tegen de lokale D1 (kost niets, controleert de SQL)
npx wrangler d1 execute waarisniels-db --local --file=migrations/0001_init.sql
npx wrangler d1 execute waarisniels-db --local --file=scripts/out/0002_seed_posts.sql

# 2. media naar R2 (114 bestanden, ~5 min; opnieuw draaien = overschrijven)
bash scripts/out/upload-media.sh

# 3. posts naar de echte D1
npx wrangler d1 execute waarisniels-db --remote --file=scripts/out/0002_seed_posts.sql

# 4. controle
npm run db:query "SELECT slug, title, json_array_length(media) AS media FROM posts ORDER BY pub_date DESC"
curl -I https://media.waarisniels.nl/images/santa-cruz/bergen.webp
```

Let op: `0002_seed_posts.sql` begint met `DELETE FROM posts;`. Opnieuw uitvoeren is dus
veilig zolang je nog geen posts via `/beheer` hebt gemaakt — daarna niet meer.

## 6. Opruimen (pas in stap 4 van de rebuild, als de chatbot eruit is)

```bash
npx wrangler vectorize delete travel-blog-index
```

En dan het `[[vectorize]]`-blok uit `wrangler.toml` halen.

---

## Snelle checklist

| # | Wat | Waar | Klaar? |
|---|---|---|---|
| 1 | `wrangler d1 create` + `database_id` in wrangler.toml | terminal | ✅ |
| 2 | `npm run db:migrate` | terminal | ✅ |
| 3 | `wrangler r2 bucket create --location weur` | terminal | ✅ |
| 4 | `media.waarisniels.nl` aan bucket koppelen | dashboard | ✅ |
| 5 | ~~`DB` + `MEDIA` binding in Pages-project~~ | — | vervallen, zie §4 |
| 6 | Google login method in Zero Trust | dashboard | ☐ |
| 7 | Access-app op `beheer` + policy op je e-mail | dashboard | ☐ |
| 8 | Access-app op `api/admin` | dashboard | ☐ |
| 9 | pages.dev-achterdeur dicht | dashboard | ☐ |
| 10 | `vectorize delete` (later, stap 4) | terminal | ☐ |
| 11 | `CLOUDFLARE_API_TOKEN` secret in GitHub heeft Pages-edit rechten | GitHub repo settings | ☐ (check) |

> Punten 6-9 zijn de enige echte blokkade die nog openstaat: zolang die er niet zijn,
> is `/beheer` publiek schrijfbaar zodra dit naar `main` gaat. Niet mergen/deployen
> voor die vier vinkjes staan.
