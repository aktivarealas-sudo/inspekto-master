# Inspekto Lite (MVP)

Dette er en enkel, offline-first PWA (kun HTML/CSS/JS) som gir deg:
- Capture (ute): ta bilder raskt uten å plassere dem i element/avvik
- Lokal kø (IndexedDB): ingen venting på opplasting i felt
- Review (i bilen): lag utstyr, sett skilt, opprett avvik med 1–4 bilder
- Rapport: generer HTML-rapport og skriv ut til PDF

## Kjøring lokalt
Service worker/PWA fungerer best på https eller localhost.

### Python
python -m http.server 8080
Åpne: http://localhost:8080

## Deploy (enkelt)
- Netlify Drop: dra hele mappen (ikke zip) inn i Netlify UI
- GitHub Pages / Cloudflare Pages: legg mappen som statisk site

## Viktig
Dette er en MVP uten ekte “AI”. Den er bygget for stabilitet og riktig workflow.
Du kan senere koble på server-side OCR/CV og legge resultat inn i Review som konservative forslag.
