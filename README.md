# Glosor

En enkel PWA för glosövning. Eleven ser det svenska ordet, hör det på svenska och/eller engelska, skriver sitt svar på engelska och markerar själv om det blev rätt eller fel — fel ord flyttas till slutet av kön och kommer tillbaka tills alla är avbockade.

## Funktioner

- 🇸🇪 **Lyssna (svenska)** — spelar upp det svenska ordet
- 🇬🇧 **Lyssna (engelska)** — spelar upp det engelska svaret (uttal)
- ✏️ **Skriv** — eleven skriver det engelska ordet
- ✓ **Rätta** — direkt feedback (rätt / fel) + visar rätt svar
- ✅ **Rätt / ✗ Fel** — självbedömning; fel ord flyttas till slutet av kön
- 🏁 **Sammanfattning** — visas när alla ord är avbockade (klarade + upprepningar)
- 🔥 **Streak** — räknar antal rätt i rad, nollställs vid fel
- 🔀 **Blanda om** — slumpa ordningen och starta om sessionen
- ↗ **Dela** — Web Share API med fallback till urklipp
- 📱 **PWA** — installeras på hemskärmen, fungerar offline
- 🌗 **Mörkt läge** — följer systeminställning
- ⌨️ **Tangentbord** — `Enter` rätta, `R` rätt, `F` fel, `S` svenska, `E` engelska

## Hur en session fungerar (v3)

1. Orden slumpas vid session-start till en kö.
2. Första ordet visas + SV-audio spelas automatiskt.
3. Eleven skriver den engelska översättningen och trycker **Rätta** (eller `Enter`).
4. Appen jämför och visar feedback. **Rätt**-knappen fokuseras automatiskt om svaret var rätt, **Fel**-knappen om det var fel. Eleven kan välja fritt (auto-fokus är ett förslag).
5. Klick på **Rätt** → ordet tas ur kön och markeras som avbockat. **Fel** → ordet flyttas till slutet av kön.
6. Nästa ord visas automatiskt + SV-audio spelas.
7. Sessionen är klar när kön är tom → sammanfattningen visas med antal klarade och antal upprepningar.
8. **Börja om** startar en ny session (samma ord, ny slumpning).

## Innehåll

| Fil | Funktion |
|-----|----------|
| `index.html` | App-skal (kort + sammanfattning) |
| `styles.css` | Styling (inkl. dark mode + .summary) |
| `app.js` | Logik (queue + self-assessment) |
| `manifest.json` | PWA-manifest |
| `sw.js` | Service worker (offline cache) |
| `glosor-data.json` | Glos-data + metadata |
| `audio/<id>-sv.mp3` | Uttal på svenska |
| `audio/<id>-en.mp3` | Uttal på engelska |
| `scripts/gen_audio.py` | Audio-generering (MiniMax T2A) |
| `worksheets/` | Historiska worksheten-bilder |
| `UPDATE.md` | Dev-/processdokumentation (audio, prompt, felsökning) |
| `icons/icon-192/512.png` | PWA-ikoner |

## Lägga till/ändra glosor

Redigera `glosor-data.json`:

```json
{
  "meta": {
    "title": "Glosor — Klass 4 Lejonskolan",
    "subtitle": "Lyssna, skriv det engelska ordet och tryck Rätta"
  },
  "words": [
    {
      "id": "01",
      "sv": "hund",
      "en": "dog",
      "en_alts": "dogs,hound",
      "audio_sv": "audio/01-sv.mp3",
      "audio_en": "audio/01-en.mp3"
    },
    {
      "id": "01-old",
      "sv": "gamla ordet",
      "en": "old word",
      "active": false,
      "archived_at": "2026-09-14T13:30:00Z",
      "audio_sv": "audio/01-old-sv.mp3",
      "audio_en": "audio/01-old-en.mp3"
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
- `active: false` + `archived_at` — markerar ordet som arkiverat (visas inte i appen, audio bevaras)

**Alltid arkivera gamla ord** när ett nytt kapitel tillkommer — sätt `active: false` och `archived_at`. Aldrig radera. Audio-filer för arkiverade ord bevaras orörda i `audio/` för historik.

För detaljer kring audio (prompter, röstkonstanter, felsökning) → se `UPDATE.md`.

## Generera nya ljudfiler

Ljudfilerna genereras med **MiniMax TTS API**. För svenska används `Swedish_male_1_v1`, för engelska `English_expressive_narrator` (samma röst genom hela appen).

- **Svenska:** röst `Swedish_male_1_v1`, prompt `Skriv ordet #"<ord>"` (`#` = paus-separator för SV-rösten)
- **Engelska:** röst `English_expressive_narrator`, prompt `Write the word "<ord>"` (UTAN `#` — EN-rösten läser det som "number")
- **Modell:** `speech-2.8-hd`, **speed:** `0.85` (långsammare för tydlighet)
- **Format:** mp3, 128 kbps
- **Filnamn:** `audio/<id>-sv.mp3` och `audio/<id>-en.mp3` (där `<id>` matchar word.id)

Kör `python3 scripts/gen_audio.py` (se `UPDATE.md` för detaljer). **Scriptet filtrerar automatiskt bort arkiverade ord** — bara aktiva ord får ny audio.

**Viktigt:** Om du byter röst måste alla filer bytas — annars blir det röst-blandning mellan orden. Verifiera att alla låter identiskt innan deploy.

## Deploy

Appen är statisk (HTML/CSS/JS). Deployas via **GitHub Pages**:

- Repo: `fam-hulten/glosor`
- URL: https://fam-hulten.github.io/glosor/

Service worker kräver HTTPS (eller `localhost`). **Bump `CACHE_NAME` i `sw.js`** när HTML/CSS/JS ändras (inkrementera version) så att användare får ny kod vid nästa besök.

## Testa lokalt

```bash
cd /home/johanna/.openclaw/repos/glosor
python3 -m http.server 8000
# Öppna http://localhost:8000
```

Service worker fungerar inte från `file://` — använd HTTP.

## Licens

MIT — se `LICENSE`.
