# Glosor

En enkel PWA för glosövning. Eleven ser det svenska ordet, hör det på svenska och/eller engelska, skriver sitt svar på engelska och jämför med facit.

## Funktioner

- 🇸🇪 **Lyssna (svenska)** — spelar upp det svenska ordet
- 🇬🇧 **Lyssna (engelska)** — spelar upp det engelska svaret (uttal)
- ✏️ **Skriv** — eleven skriver det engelska ordet
- ✓ **Rätta** — direkt feedback (rätt / fel)
- 👁 **Visa svar** — jämför elevens svar med rätt översättning
- 🔀 **Blanda om** — slumpa ordningen
- ↗ **Dela** — Web Share API med fallback till urklipp
- 📱 **PWA** — installeras på hemskärmen, fungerar offline
- 🌗 **Mörkt läge** — följer systeminställning
- ⌨️ **Tangentbord** — `←/→` navigera, `S` svenska, `E` engelska, `Enter` rätta, `V` visa

## Innehåll

| Fil | Funktion |
|-----|----------|
| `index.html` | App-skal |
| `styles.css` | Styling (inkl. dark mode) |
| `app.js` | Logik |
| `manifest.json` | PWA-manifest |
| `sw.js` | Service worker (offline cache) |
| `glosor-data.json` | Glos-data + metadata |
| `audio/<id>-sv.mp3` | Uttal på svenska |
| `audio/<id>-en.mp3` | Uttal på engelska |
| `icons/icon-192/512.png` | PWA-ikoner |

## Lägga till/ändra glosor

Redigera `glosor-data.json`:

```json
{
  "meta": {
    "title": "Glosor — Klass 4 Lejonskolan",
    "subtitle": "Lyssna, skriv det engelska ordet och jämför med facit"
  },
  "words": [
    {
      "id": "01",
      "sv": "hund",
      "en": "dog",
      "en_alts": "dogs,hound",
      "audio_sv": "audio/01-sv.mp3",
      "audio_en": "audio/01-en.mp3"
    }
  ]
}
```

Fält:
- `id` — unikt ID (används för audio-filer)
- `sv` — svenskt ord (det eleven ska översätta från)
- `en` — rätt engelskt svar
- `en_alts` — valfritt, kommaseparerade alternativ som också accepteras (t.ex. pluraliserade former)
- `audio_sv` / `audio_en` — sökväg till MP3-filer

## Generera nya ljudfiler

Ljudfilerna genereras med **MiniMax TTS API**. För svenska används `Swedish_male_1_v1`, för engelska `English_expressive_narrator` (samma röst genom hela appen).

- **Svenska:** röst `Swedish_male_1_v1`, tempo normal
- **Engelska:** röst `English_expressive_narrator`, tempo 0.85 (långsammare för tydlighet)
- **Format:** mp3, 64–128 kbps
- **Filnamn:** `audio/<id>-sv.mp3` och `audio/<id>-en.mp3` (där `<id>` matchar word.id)

**Viktigt:** Om du byter röst måste alla filer bytas — annars blir det röst-blandning mellan orden. Verifiera att alla låter identiskt innan deploy.

## Deploy

Appen är statisk (HTML/CSS/JS). Deployas via **GitHub Pages**:

- Repo: `fam-hulten/glosor`
- URL: https://fam-hulten.github.io/glosor/

Service worker kräver HTTPS (eller `localhost`).

## Testa lokalt

```bash
cd /home/johanna/.openclaw/repos/glosor
python3 -m http.server 8000
# Öppna http://localhost:8000
```

Service worker fungerar inte från `file://` — använd HTTP.

## Licens

MIT — se `LICENSE`.
