# Glosor Audio Update Guide

**Syfte:** Uppdatera eller utöka audio-filer när nya ord tillkommer eller när någon ska ändra i befintliga.

---

## v3 Arkitektur (queue + self-assessment, 2026-09-14)

**Bakgrund:** Johanna ville ha samma flow som `fam-hulten/begrepp` — användaren markerar själv rätt/fel efter Rätta, fel ord flyttas till slutet av kön och kommer tillbaka tills alla är avbockade.

### Datamodell (i `app.js`)

```javascript
let allWords = [];              // alla aktiva ord (från JSON, arkiverade filtrerade bort)
let queue = [];                 // kö av ord-ID:n som INTE är avbockade ännu
let masteredThisSession = [];   // ID:n som klarats under sessionen
let sessionRepeats = 0;         // antal gånger ett ord flyttats till slutet av kön
let currentCard = null;         // aktuellt ord-objekt (queue[0])
let revealed = false;           // har svaret visats (via Rätta)?
let streak = 0;                 // antal rätt i rad (nollställs vid fel)
```

### Session-flöde

1. `init()`: Fisher-Yates-shuffle av `allWords.map(w => w.id)` → `queue`. `masteredThisSession = []`, `streak = 0`.
2. `nextCard()`: om `queue.length === 0` → `showSummary()`. Annars: `currentCard = allWords.find(w => w.id === queue[0])`. `renderCard()` play'ar SV-audio automatiskt efter 400ms.
3. `checkGuess()` (klick på Rätta / Enter): auto-jämför `guessInput.value` mot `currentCard.en` (case-insensitive, trim). Visar feedback + rätt svar. **`revealed = true`**, selfAssess-knappar visas. **Auto-fokus** på Rätt om auto-check sa rätt, Fel om fel — användaren kan overrida.
4. `selfAssess(correct)` (klick på Rätt/Fel eller `R`/`F`):
   - Om **rätt**: `queue.shift()`, `masteredThisSession.push(currentCard.id)`, `streak++`.
   - Om **fel**: `queue.shift()`, `queue.push(cardId)` (till slutet av kön), `sessionRepeats++`, `streak = 0`.
   - Anropa `nextCard()`.
5. `showSummary()`: dölj `<main class="card">`, visa `<section class="summary">` med `masteredThisSession.length`, `sessionRepeats`, och "Börja om"-knapp.
6. `startOver()` / `shuffleWords()`: anropa `init()` igen.

### Progress bar (`.progress-dot`)

- Avbockade (`< masteredThisSession.length`): grön (`var(--success)`)
- Aktiv (= `masteredThisSession.length`): blå + förstorad (`var(--primary)`)
- Övriga: grå (`var(--border)`)

### Tangentbord

- `Enter` (i input): Rätta (om ej revealed)
- `R` / `r`: Rätt (om revealed)
- `F` / `f`: Fel (om revealed)
- `S` / `s`: Spela SV-audio
- `E` / `e`: Spela EN-audio

### Service worker cache-version

`sw.js` har `CACHE_NAME = 'glosor-vN'`. **Bump N vid varje HTML/CSS/JS-ändring** så att användare får ny kod vid nästa besök. Aktiva sessioner kan behöva en hard refresh (DevTools → Application → Service Workers → Unregister) om SW inte uppdateras automatiskt.

### Relation till begrepp

Samma mönster (`queue[]`, `masteredThisSession[]`, `selfAssess(correct)`, `showSummary()`). Skillnaden:
- Glosor har typing-input + auto-check (begrepp är ren flashcard).
- Glosor har ett progress-bar-mönster (begrepp har samma).
- Glosor saknar mode-switching (begrepp har forward/reverse).

Om begrepp ändras — kolla om glosor bör följa efter (eller tvärtom). Annars riskerar de att divergera.

---

**Processordning (VIKTIGT — lärdom från 2026-09-01 + 2026-09-08):**

1. **Diskutera FÖRST, generera SEN.** Aldrig `mmx speech synthesize` direkt efter en pushback — diskutera fram rätt approach med användaren.
2. **Lyssna på FÖREGÅENDE audio innan du ändrar något.** Öppna appen på https://fam-hulten.github.io/glosor/ och hör hur orden låter nu.
3. **Verifiera röst-prompten fungerar** med `--dry-run` (eller litet test) innan batch.
4. **Läs ALLTID både SV + EN från worksheten** (läxa 2026-09-08). Eleven ska lära sig SPECIFIKT det ord läraren valt på worksheten — inte en "korrekt" översättning från mitt eget huvud. Om worksheten säger `godis → treat`, är det `treat` som gäller, inte `candy`/`sweets`. **Aldrig gissa översättningar.** Om bilden bara visar SV-kolumnen: fråga Johanna om EN, eller be om bild igen — generera ALDRIG audio med egna översättningar.
   - **Upplöst 2026-09-14:** 'The Family'-tematet (13 ord, 2026-09-08) hade delvis gissade översättningar. Regenererades INTE (verifierad OK), men **audio-filerna är bevarade** som `tf-old-01..13` om framtida regenerering behövs.

---

## Steg-för-steg: Lägg till nytt ord

### 1. Redigera `glosor-data.json`

Lägg till en ny post i `words[]`:

```json
{
  "id": "12",
  "sv": "<svenskt ord>",
  "en": "<engelskt ord>",
  "en_alts": "<alternativa engelska, komma-separerade>",
  "audio_sv": "audio/12-sv.mp3",
  "audio_en": "audio/12-en.mp3"
}
```

### 2. Generera audio med scriptet

```bash
cd /home/johanna/.openclaw/repos/glosor
python3 scripts/gen_audio.py --dry-run --lang both   # förhandsvisa
python3 scripts/gen_audio.py --lang both --out-dir audio/   # generera
```

`--lang both` genererar BÅDE SV och EN. För bara ETT språk: `--lang sv` eller `--lang en`.

### 3. Verifiera

```bash
file audio/12-sv.mp3 audio/12-en.mp3
# Förväntat: "Audio file with ID3 version 2.4.0, contains: MPEG ADTS, layer III"
```

### 4. Committa och pusha

```bash
git add glosor-data.json audio/
git commit -m "Audio: Lägg till ord 12 '<sv>'/ '<en>'"
git push origin main
```

### 5. Verifiera live

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://fam-hulten.github.io/glosor/audio/12-sv.mp3
# Förväntat: 200
```

---

## Arkivering av ord (Johanna #14643 + #14647 + #15044)

**Syfte:** Ord som inte längre är aktiva (t.ex. avslutade kapitel, utgångna veckor) ska INTE visas i appen, men INTE heller raderas — de ska finnas kvar i git-historik.

### Hur man arkiverar

Lägg till två fält i `glosor-data.json` på det ord som ska bort:

```json
{
  "id": "05",
  "sv": "någonstans",
  "en": "somewhere",
  "active": false,              // NYTT — markerar som arkiverad
  "archived_at": "2026-09-08",  // NYTT — ISO-datum för historik
  ...
}
```

### Tekniskt

- `app.js` filtererar bort ord med `active: false` vid `loadData()`:
  ```javascript
  words = allWords.filter(w => w.active !== false);
  ```
- `active !== false` betyder: ord utan `active`-fält är default aktiva (bakåtkompatibelt).
- Progress-bar räknar BARA aktiva ord (totalsiffra = antal synliga ord).
- Audio-filer stannar kvar i `audio/` (refereras inte från JSON, finns kvar i git-historik).
- **Ingen UI-markering** för arkiverade ord (ren app, arkivering är admin-grej).
- `scripts/gen_audio.py` filtrerar också bort arkiverade ord — scriptet genererar bara audio för aktiva ord, så historiska audio-filer skrivs inte över av misstag.

### Audio-arkiveringsmönster (2026-09-14, etablerat för "The Family")

När ett helt kapitel (med många ord) arkiveras, **flytta audio-filerna** till ett nytt namn innan nya genereras:

- Befintliga aktiva filer: `audio/01-sv.mp3`, `audio/02-sv.mp3`, ..., `audio/13-sv.mp3`
- Flytta till: `audio/<tema>-old-01-sv.mp3`, `audio/<tema>-old-02-sv.mp3`, ..., `audio/<tema>-old-13-sv.mp3`
- Exempel: `The Family` → `tf-old-01-sv.mp3` ... `tf-old-13-sv.mp3` (commit f07144d)
- ID:n i JSON följer samma mönster: `tf-old-01`, `tf-old-02`, ...

**Varför:** Om man behåller ID:n `01-13` för nya aktiva ord och genererar ny audio, skrivs den gamla audio:en över och går förlorad. Genom att flytta filerna + döpa om ID:n bevaras allt i git-historik.

**Aldrig radera audio-filer.** Alltid git-versionshanterade.

### Verifiering

```bash
# Räkna aktiva vs arkiverade
python3 -c "
import json
with open('glosor-data.json') as f:
    data = json.load(f)
total = len(data['words'])
archived = [w for w in data['words'] if w.get('active') == False]
print(f'Aktiva: {total - len(archived)}/{total}')
print(f'Arkiverade: {[w[\"id\"] for w in archived]}')
"
```

### Återaktivera

Ta bort `active`-fältet (eller sätt till `true`):

```json
{
  "id": "05",
  ...
  // "active": false,    ← ta bort denna rad
  "archived_at": "2026-09-08"  // valfritt: behåll eller ta bort
}
```

---

## VIKTIGA konstanter (rör ALDRIG utan diskussion)

### Voice IDs (MiniMax T2A)

```python
VOICE_SV = "Swedish_male_1_v1"             # SV — läser #-tecken som PAUS
VOICE_EN = "English_expressive_narrator"   # EN — läser #-tecken som "number"
```

**Viktigt:** `-tecknet beter sig olika i SV- och EN-rösten. Testa separat.**

### Prompt-format

**SV:** `Skriv ordet #"<ord>"`
- `#` fungerar som paus-separator i SV-rösten
- citationstecken runtom ordet

**EN:** `Write the word "<ord>"`
- UTAN `#` (EN-rösten läser det som "number", INTE paus)
- citationstecken runtom ordet

### Modell och hastighet

```python
MODEL = "speech-2.8-hd"
SPEED = "0.85"   # Långsammare för barn (10 år) med språkstörning
```

### Auth

```bash
mmx auth login --api-key "$(cat /tmp/.mmx-key)"   # UTAN --region!
```

**VIKTIGT:** `--region` AKTIVT BRYTER auth (Johanna #14607). CLI auto-detectar → "global" ändå.

---

## Felsökning

### "API error: login fail"
1. Kolla `/home/node/.mmx/config.json` finns och ägs av `node:node`
2. Om root:root: kör `sudo chown -R 1000:1000 /mnt/system-extension-kingston/openclaw/data/mmx`
3. Permanent fix: docker-entrypoint.sh har redan chown-sektion (commit fe20122)

### Unicode-fel "character at index 14 has value 8230"
- Nyckeln i shell har Unicode-ellipsis (`…`) pga censurering
- Lösning: hämta nyckel från fil: `--api-key "$(cat /tmp/.mmx-key)"`

### Fil låter konstigt ("number", "pound", etc.)
- Genererade troligen med fel #-konvention
- Jämför med senaste fungerande fil: skillnad i prompt
- Diskutera med Johanna INNAN regenerering

---

## Historik (för kontext)

- **2026-09-14**: **v3 — queue + self-assessment** (commit f566cb4)
  - Portat från `fam-hulten/begrepp`: queue[] istället för currentIndex, selfAssess(correct), summary-skärm
  - Auto-fokus på Rätt/Fel efter check (användaren kan overrida)
  - Streak ökar på ratt, nollställs på fel
  - Tangentbord: R = rätt, F = fel (när revealed)
  - Tog bort stora top-reveal + prev/next-knappar
  - `sw.js` CACHE_NAME: `glosor-v1` → `glosor-v3`
  - README + UPDATE.md uppdaterade

- **2026-09-14**: Cykel-fel korrigering (commit 3aac540)
  - id 05: "cykel/bike" → "cykler/cycles" (plural, recurring — inte fordon)
  - Audio regenererad för bara id 05 (2 filer via temp-data-json, sparade 22 onödiga API-anrop)

- **2026-09-14**: **Do you like cars?** — nytt kapitel (commit f07144d)
  - 12 nya ord från worksheten "Do you like cars?" (årskurs 2 / Lejonskolan)
  - The Family (13 ord) arkiverat som `tf-old-01..13`, audio bevarat
  - `gen_audio.py` får archive-filter (skippar aktiva ord från script-körning)
  - `01-old..11-old`-audio-paths fixade (pekade tidigare på aktiva ord)

- **2026-09-08**: The Family-temat (13 ord) — första kompletta kapitel-deploy
  - Vissa översättningar gissade (läxa — numera strikt regel att läsa både SV+EN från worksheten)

- **2026-09-01**: Första audio-generering. 6 commits pga flera pushbacks:
  - 5c423f0: första försöket (hade "Säg ordet" + #)
  - 1ccdded: fixade till "Skriv ordet"
  - 17224eb: tog bort # i EN (hade FEL antagande)
  - 5ebb65a: tog bort # i SV (hade FEL antagande)
  - 5dd8fa9: återställde # (Johanna: # är paus-separator)
  - c583520: tog bort # BARA i EN (Johanna: SV/EN-röster beter sig olika)

- **Läxa loggad i `workspace/memory/audio-permanent-fix.md`**

---

## Relaterat

- `workspace/memory/audio-permanent-fix.md` — auth + EACCES-fix-dokumentation
- `scripts/gen_audio.py` — själva scriptet (verifiera att det är uppdaterat med rätt prompter)
- `rattstavning/AUDIO-PIPELINE.md` — auktoritativ källa för voice-IDs
- `openclaw-infrastructure/docker-entrypoint.sh` — chown-sektion (commit fe20122)

---

## Roadmap — framtida features (Johanna #14643)

**Syfte:** Hålla koll på nästa steg för appen, dokumenterade men INTE implementerade ännu.

### Bilder för varje ord
- **Status:** Diskuterat, ej påbörjat
- **Plan:** Hitta/lägg till bilder (PNG/JPG) för varje ord i `images/<id>.png` eller liknande
- **App:** Visa bild bredvid svenskt ord (hjälper barn med språkstörning att koppla ord → objekt)
- **Källa:** Kan scrapas från Glosor.eu eller använda fria bildbanker (Unsplash, Pixabay)

### Sentence examples (exempelmeningar)
- **Status:** Diskuterat, ej påbörjat
- **Plan:** Utöka `glosor-data.json` med `example_sv` och `example_en` per ord
- **App:** Visa exempelmening efter rätt svar (eller vid "reveal"-knappen)

### Paper mode (utskriftsvänligt)
- **Status:** Diskuterat, ej påbörjat
- **Plan:** Generera PDF/HTML med alla aktiva ord för utskrift — barnet kan öva offline
- **Verktyg:** `wkhtmltopdf` eller liknande (Tectonic finns redan i workspace)

### "I can't find my dad" — utöka med fler kapitel
- **Status:** Pågående (nästa vecka)
- **Plan:** Lägg till ord 12, 13, ... i `glosor-data.json` när nya glosor-kapitel tillkommer
- **Audio:** Kör `python3 scripts/gen_audio.py --lang both --out-dir audio/` för nya ord

### Förbättrad felåterkoppling
- **Status:** Idé
- **Plan:** När barnet skriver fel, visa rätt svar med ljud (SV) + färg-kod
- **Möjligt:** Streak-systemet finns redan (se app.js)

### Multi-device sync (PWA state)
- **Status:** Idé
- **Plan:** Spara streak/progress i `localStorage` ELLER remote (Firebase?)
- **Just nu:** Allt är client-side, ingen persistence

---

**Senast uppdaterad:** 2026-09-14 (v3-arkitektur + dokyu-uppdatering)
