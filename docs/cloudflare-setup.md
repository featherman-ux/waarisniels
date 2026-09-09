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
npm run db:init:DANGER-wist-alle-posts   # remote — LEEST DE NAAM. Dit dropt posts.
npm run db:init:local                    # lokaal, voor wrangler dev
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

> **Achterdeur — grotendeels gedicht in de code.** Access geldt voor
> `waarisniels.nl`, niet voor de `*.waarisniels.pages.dev`-URL's van Pages.
> `requireAccess()` in `src/pages/api/_utils.ts` eist daarom bij elk
> `/api/admin`-endpoint én elke `/beheer`-pagina dat Access een
> `Cf-Access-Jwt-Assertion`-header heeft meegestuurd. Die ontbreekt op pages.dev,
> dus daar valt alles dicht met een 403. Localhost is uitgezonderd zodat
> `wrangler pages dev` blijft werken.
>
> Dat is een aanwezigheidscontrole, geen handtekeningverificatie: Access blijft de
> echte authenticatie. Wil je het strenger, verifieer de JWT dan tegen
> `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`.
>
> Wil je het gat helemaal dicht, zet dan alsnog een derde Access-app op
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

## 7. Mailnotificatie bij een nieuwe post — Resend

De site kan een mailtje sturen zodra er een post live staat. Dubbele opt-in:
zonder klik in de bevestigingsmail staat niemand op de lijst.

### 7.1 Tabellen aanmaken

```bash
npm run db:migrate:subs        # remote
npm run db:migrate:subs:local  # lokaal
```

> Draai **nooit** `db:init:DANGER-wist-alle-posts` op productie tenzij je precies
> dat wilt: dat is `0001_init.sql`, en die begint met `DROP TABLE posts`. De naam is
> met opzet onhandig. `0002_subscribers.sql` is puur additief
> (`CREATE TABLE IF NOT EXISTS`) en kun je zo vaak draaien als je wilt.
>
> Alle `--file`-scripts draaien via `npx wrangler@4.129.0` in plaats van de wrangler
> uit node_modules. Die is door `@astrojs/cloudflare` gepind op 4.33, en versies onder
> ~4.4x geven op het D1-import-endpoint een `Authentication error [code: 10000]`,
> ook met een token dat `d1:write` én Super Administrator heeft. Los van de scopes dus.
> `npm i -D wrangler@latest` lost dat *niet* op: dat botst op
> `@cloudflare/workers-types` v4 vs v5.

### 7.2 Resend instellen

1. Account op resend.com, domein `waarisniels.nl` toevoegen.
2. De DKIM/SPF-records die Resend geeft in Cloudflare DNS zetten. Zet ze op
   **DNS only** (grijze wolk), niet geproxyd.
3. Wachten tot Resend het domein als geverifieerd toont.
4. API-key aanmaken met alleen *sending*-rechten.

### 7.3 Secrets in Cloudflare

Workers & Pages → het project → Settings → Variables and Secrets. Beide als
**secret**, niet als plain text, en niet in `wrangler.toml`:

| Naam | Waarde |
| --- | --- |
| `RESEND_API_KEY` | `re_...` |
| `MAIL_FROM` | `Niels <post@waarisniels.nl>` |

Zonder deze twee blijft het formulier staan, maar geeft `/api/subscribe` een
503 met een nette melding. De rest van de site draait gewoon door.

### 7.4 Een post versturen

**Normale weg: de knop in `/beheer`.** Bij elke gepubliceerde post staat *Test*
en *Verstuur*. Je browser is via Access ingelogd, dus die stuurt de
`Cf-Access-Jwt-Assertion`-header vanzelf mee — geen tokens nodig, werkt ook op je
telefoon. *Verstuur* vraagt twee klikken. Bovenaan staat hoeveel mensen er op de
lijst staan, en per post of hij al gemaild is.

**Vanaf de terminal** werkt `curl` níet zomaar: Access laat een browsersessie
door, geen kaal HTTP-verzoek, dus je krijgt een 403 van `requireAccess()`. Wil je
het toch scripten, maak dan een **service token** (Zero Trust → Access → Service
Auth) en voeg die toe aan de policy van de `api/admin`-applicatie:

```bash
curl -X POST https://waarisniels.nl/api/admin/notify \
  -H "CF-Access-Client-Id: <id>" \
  -H "CF-Access-Client-Secret: <secret>" \
  -H 'content-type: application/json' \
  -d '{"slug":"brasil"}'
```

Zonder service token, ter referentie (geeft 403):

```bash
# hoeveel mensen staan er op de lijst?
curl https://waarisniels.nl/api/admin/notify

# eerst naar jezelf, telt niet als verzonden
curl -X POST https://waarisniels.nl/api/admin/notify \
  -H 'content-type: application/json' \
  -d '{"slug":"brasil","testTo":"veerman.niels@gmail.com"}'

# en dan echt
curl -X POST https://waarisniels.nl/api/admin/notify \
  -H 'content-type: application/json' \
  -d '{"slug":"brasil"}'
```

Een post die al gemaild is wordt geweigerd met een 409; `"force": true` gaat er
alsnog overheen. Verzenden gebeurt in blokken van honderd, en een mislukt blok
houdt de rest niet tegen.

### 7.5 DNS-records

Resend geeft er drie (SPF, DKIM, MX op `send.`). Alle drie op **DNS only**
(grijze wolk) zetten, anders proxyt Cloudflare ze kapot.

Aanrader daarnaast: een DMARC-record. Gmail en Outlook kijken ernaar en het
scheelt in de spamscore.

| Naam | Type | Waarde |
| --- | --- | --- |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:veerman.niels@gmail.com` |

`p=none` betekent alleen rapporteren, nog niets weigeren.

### 7.6 Wat er in de mail staat

Elke mail krijgt een persoonlijke afmeldlink, in de voettekst én in de
`List-Unsubscribe`-header — daardoor tonen Gmail en Apple Mail hun eigen
afmeldknop, wat de kans op een spamklacht flink verkleint.

## 8. Bots en scrapers

Alles op een openbare site is leesbaar. Wat je kunt regelen is (a) wat je vraagt,
(b) wat je juridisch voorbehoudt, en (c) wat je daadwerkelijk tegenhoudt. Dat zijn
drie verschillende dingen.

### 8.1 Wat er in de code staat — a en b

`public/robots.txt` doet drie dingen:

- **Content-Signal** (`search=yes, ai-input=no, ai-train=no`). Machineleesbaar, en
  in de EU een uitdrukkelijk rechtenvoorbehoud onder artikel 4 van richtlijn
  2019/790. Dit is het onderdeel dat juridisch iets betekent.
- **Trainingscrawlers op Disallow**: GPTBot, ClaudeBot, CCBot, Google-Extended,
  Applebot-Extended, Bytespider, Meta-ExternalAgent en een stuk of vijftien andere.
- **Zoekmachines en linkvoorbeelden blijven welkom.** Googlebot, Bingbot, maar ook
  facebookexternalhit en Slackbot — zonder die laatste toont een link die je in
  WhatsApp deelt geen titel en geen foto meer.

De RSS-feed geeft alleen titels en samenvattingen (nooit de volledige tekst), staat
op vijftien items, en draagt een `copyright`-veld plus `X-Robots-Tag: noai`.

> Twee valkuilen als je `robots.txt` bewerkt, allebei stil kapot:
>
> 1. Een **lege regel sluit een groep af**; een commentaarregel niet. Een lege
>    regel tussen `User-agent:` en zijn regels maakt alles daaronder weesregels.
> 2. Zet **`Disallow` boven `Allow: /`**. Officieel (RFC 9309) wint de meest
>    specifieke match en maakt volgorde niet uit, maar veel crawlers pakken gewoon
>    de eerste regel die past. Met `Allow: /` bovenaan waren `/beheer` en `/api/`
>    voor die crawlers alsnog toegestaan.
>
> Na elke wijziging even natesten:
> `python3 -c "from urllib.robotparser import RobotFileParser as R; r=R(); r.parse(open('public/robots.txt').read().splitlines()); print(r.can_fetch('GPTBot','/blog/'), r.can_fetch('Googlebot','/blog/'), r.can_fetch('Googlebot','/beheer'))"`
> — verwacht: `False True False`.

### 8.2 Wat het echt tegenhoudt — c

`robots.txt` is een verzoek. Een scraper die zich niet gedraagt trekt zich er niets
van aan. Afdwingen gebeurt bij Cloudflare, en dat kan op het gratis plan:

1. Dashboard → je domein → **AI Crawl Control**.
2. Tab **Crawlers**: hier staat welke AI-bots je site daadwerkelijk hebben bezocht,
   met aantallen. Alleen dit al is de moeite waard om een keer te bekijken.
3. Zet de crawlers die je niet wilt op **Block**.

Cloudflare maakt daar één WAF custom rule voor aan, die de bot een 403 geeft
vóórdat hij bij je Worker komt. Blokkeer je later ook via de WAF met een eigen
regel, zorg dan dat die niet met de AI Crawl Control-regel botst — de volgorde
in *Security rules → Custom rules* bepaalt wie wint.

Er is ook een tab **Robots.txt** die laat zien welke crawlers jouw regels
overtreden. Dat is de lijst om vervolgens te blokkeren.

### 8.3 Wat je niet moet verwachten

- Een bot die zijn user-agent vervalst valt hier buiten. Daarvoor is *Bot Fight
  Mode* (Security → Bots), maar dat raakt soms ook legitiem verkeer — aanzetten
  als je er last van hebt, niet preventief.
- `X-Robots-Tag: noai` is een voorkeur die vrijwel niemand opvolgt. Het staat er
  omdat het niets kost, niet omdat het werkt.
- Iemand die je site met de hand kopieert houd je sowieso niet tegen.

## Snelle checklist

| # | Wat | Waar | Klaar? |
|---|---|---|---|
| 1 | `wrangler d1 create` + `database_id` in wrangler.toml | terminal | ✅ |
| 2 | `npm run db:init:DANGER-wist-alle-posts` | terminal | ✅ |
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
