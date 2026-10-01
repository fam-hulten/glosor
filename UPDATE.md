# Glosor Audio Update Guide

**Syfte:** Uppdatera eller utöka audio-filer när nya ord tillkommer eller när någon ska ändra i befintliga.

---

## v5 Arkitektur (pronunciation_dict — verifierat IPA, 2026-09-15)

**Bakgrund:** Worksheten "Do you like cars?" har `cykel/bike` (inte `cykler/cycles`). MiniMax TTS defaultade till fel uttal på två sätt: (1) hårt c (`kykel` = "följd/serie"-betydelsen), (2) långt y /yː/ (samma "följd/serie"-varianten). Verifierat mot sv.wiktionary.org/wiki/cykel (citerar SAOL — samma källa som svenska.se).

### IPA-verifiering (sv.wiktionary.org/wiki/cykel)

| Betydelse | IPA | Uttal |
|-----------|-----|-------|
| **fordon** (bike) | **/²sʏkːɛl/** | kort y /ʏ/ + dubbel k /kː/ |
| händelser (period) | /²syːkɛl/ | långt y /yː/ + enkel k |

TTS:n producerade "händelser"-varianten (default瑞典). Vi vill ha "fordon"-varianten.

### pronunciation_dict (MiniMax T2A)

API-parameter: `pronunciation_dict.tone` (lista av `original/ersättning`-par).
mmx-cli: `--pronunciation <from>/<to>` (repeatable).

**Exempel:**
```
--pronunciation cykel/sykkel
--pronunciation motorcykel/motorsykkel
```

**Logik:** Stavningen med dubbel konsonant (`-kk-`) tvingar kort vokal enligt svensk ortografi. Norsk stavning (`sykkel`, `motorsykkel`) är fonologiskt identisk med svenskt fordon-uttal — IPA /²sʏkːɛl/ matchar exakt.

### Pre-flight check (VIKTIGT — lärdom 2026-09-15)

**Innan TTS-generering:** slå upp IPA på sv.wiktionary.org (eller svenska.se om åtkomligt). Speciellt för ord med:
- Tvetydig uttal (cykel = fordon vs period — olika IPA!)
- Compound words (motorcykel, barncykel — samma cykel-suffix-regel)
- Ovanlig fonetik

Sparar iterations-tid (försök 1 → försök 2 → försök 3 denna gång pga missad pre-check).

### Förändringar i v5

- `glosor-data.json`: id 05 `cykler/cycles` → `cykel/bike` (rätt mot worksheten)
- `audio/05-sv.mp3`: regenererad med `cykel/sykkel`
- `audio/05-en.mp3`: regenererad för nya EN-ordet `bike`
- `audio/08-sv.mp3`: regenererad med `motorcykel/motorsykkel`
- `sw.js`: CACHE_NAME `glosor-v4` → `glosor-v5`
- `index.html`: `?v=4` → `?v=5` (CSS + JS cache-bust)
- Ingen app-kod-ändring (v4 pappersläge orörd)

### Andra TTS-kontroller (referens, från MiniMax-docs)

- `--pitch`, `--volume`, `--speed` — rör inte uttal
- `<#x#>` paustecken i texten (0.01–99.99s) — för rytm
- `language_boost: auto` (default) / explicit `--language Swedish`
- Inga IPA/SSML-funktioner i T2A-API:t vi använder — `pronunciation_dict` är huvudalternativet

### Uttals-källor (för framtida pre-checks)

- **sv.wiktionary.org/wiki/<ord>** — bäst för svenska ord, citerar SAOL, har IPA + uttal
- **svenska.se** — SAOL/SO/SAOB auktoritativt, men JS-renderad (svår att fetch:a automatiskt)
- **en.wikipedia.org/wiki/Help:IPA/Swedish** — auktoritativ IPA-tabell, fonem-beskrivningar

---

## v4 Arkitektur (pappersläge — input-rutan borttagen, 2026-09-15)

**Bakgrund:** Zacharias skriver bara på papper. Input-rutan + auto-keyboard var störande. Rätta-knappen visar nu bara facit direkt (samma kod som tidigare när input var tom). Efteråt markerar eleven själv rätt/fel på papper ↔ facit.

**Tekniska ändringar:**

- **HTML:** `<div class="input-row">` + `<input id="guessInput">` borttaget helt. Subtitle/hint-text uppdaterad till "Lyssna, skriv svaret på papper och tryck Rätta för att se facit".
- **JS (`app.js`):**
  - `guessInput`-referensen borttagen (const, focus, value, disabled, keydown-listener).
  - `guessInput.focus()` borttagen i `renderCard()` → tangentbordet poppar INTE upp automatiskt.
  - `checkGuess()` förenklad: visar bara `Svar: <en-answer>` (samma som tidigare "tom guess"-gren). Auto-fokus på Rätt/Fel borttaget (visste inte om det var rätt — input fanns ju inte).
  - `Enter` flyttad från input-keydown till global keydown handler (fungerar fortfarande som "rätta" utan input).
- **SW:** `CACHE_NAME` bumpad `glosor-v3` → `glosor-v4`.
- **CSS:** `.input-row` och `.guess-input`-regler borttagna (main + mobile media query + dark mode).

**Tangentbord (oförändrat för R/F/S/E, Enter flyttad till global):**

- `Enter`: Rätta (om ej revealed) — global keydown nu
- `R` / `r`: Rätt (om revealed)
- `F` / `f`: Fel (om revealed)
- `S` / `s`: Spela SV-audio
- `E` / `e`: Spela EN-audio

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
3. `checkGuess()` (klick på Rätta / Enter): visar facit (`Svar: <en-answer>`). **`revealed = true`**, selfAssess-knappar visas. **Ingen auto-fokus** (sedan v4 — vet inte om det var rätt, användaren jämför med papper).
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

### Tangentbord (v3 — input-läge)

- `Enter` (i input): Rätta (om ej revealed)
- `R` / `r`: Rätt (om revealed)
- `F` / `f`: Fel (om revealed)
- `S` / `s`: Spela SV-audio
- `E` / `e`: Spela EN-audio

> **Från och med v4 (pappersläge):** input-rutan är borttagen. `Enter` är nu global keydown och fungerar utan input. Övriga tangenter oförändrade.

### Service worker cache-version

`sw.js` har `CACHE_NAME = 'glosor-vN'`. **Bump N vid varje HTML/CSS/JS-ändring** så att användare får ny kod vid nästa besök. Aktiva sessioner kan behöva en hard refresh (DevTools → Application → Service Workers → Unregister) om SW inte uppdateras automatiskt.

### Relation till begrepp

Samma mönster (`queue[]`, `masteredThisSession[]`, `selfAssess(correct)`, `showSummary()`). Skillnaden:
- Glosor är i **pappersläge** (sedan v4): Rätta visar facit, användaren jämför med papper och markerar rätt/fel. Begrepp är ren flashcard (visar fråga, användaren tänker ut svar, klickar Rätta för att se facit).
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

## v7 Arkitektur (prev/next + drop self-mark i app-läge, 2026-10-01)

**Bakgrund:** Efter att mode-toggle landats (v6) påpekade Johanna att self-mark-knapparna kändes "onödiga och dubbla" i app-läge — appen graderar ju redan. Diskussion ledde till: skippa self-mark helt i app-läge, lägg till ← Bak / Nästa →-navigation (samma mönster som rättstavning), auto-advance på rätt, manuell Nästa på fel.

**Tekniska ändringar:**

- **HTML (`index.html`):**
  - Lade till `<div class="nav">` med `#prevBtn` (`← Bak`) + `#nextBtn` (`Nästa →`, primary-next styling).
  - `<div class="self-assess hidden" id="selfAssess">` BEHÅLLEN — används fortfarande i papper-läge (där appen inte vet vad barnet skrev på pappret).
  - Kbd-hint uppdaterad med `<span class="kbd">←</span> <span class="kbd">→</span> navigera`.
  - Cache-bust `?v=7` → `?v=8`.
- **JS (`app.js`):**
  - Datamodell ändrad: `queue[]` + `nextCard()` → `order[]` + `currentIndex` + `renderCard()`. `order` är en dynamisk lista som shufflas en gång i `init()`; fel-ord flyttas till slutet via `order.splice(currentIndex, 1)` + `order.push(wordId)`.
  - Nya funktioner `prevWord()` / `nextWord()` som justerar pekaren och anropar `renderCard()`.
  - `checkGuess()` förgrenad på `appMode`:
    - **Paper:** oförändrat från v6 (visar facit + self-mark).
    - **App + rätt:** ✓ Rätt! visas, `setTimeout(nextWord, 800)` för auto-advance. INGA knappar visas.
    - **App + fel:** ✗ Inte rätt med diff, ordet flyttas till slutet av `order`, currentIndex pekar på nästa ord. Användaren klickar `[Nästa →]` för att gå vidare. **Ingen self-mark alls i app-läge.**
  - `selfAssess()` används nu BARA i papper-läge (app-läge graderas av `checkGuess()` direkt).
  - `renderProgress()` använder `Set(masteredThisSession)` för completed dots (så att fel-ord som flyttats till slutet inte visar grön prick).
  - Nav-knapparna har `disabled`-state: `prevBtn.disabled = currentIndex === 0`, `nextBtn.disabled = currentIndex === order.length - 1`. NextBtn re-enable:as automatiskt efter fel i app-läge (även om currentIndex inte ändrades).
  - Tangentbord: ArrowLeft/ArrowRight för prev/next (skippar om target är INPUT).
  - nextBtn får focus efter fel i app-läge (så tangentbordsmänniskan kan trycka Enter).
- **CSS (`styles.css`):**
  - `.nav` + `.primary-next` fanns REDAN definierade sedan tidigare (precis för detta ändamål, men använda inte). Inga stiländringar behövdes.
- **SW:** `CACHE_NAME` `glosor-v7` → `glosor-v8`.

**Navigation-mentalitet (v7):**

- ← Bak / Nästa → är alltid synliga aktiva (förutom vid list-ändarna).
- ← Bak går till föregående ord i `order[]` (rör inte mastery — användaren kan kolla om på ett tidigare ord).
- Rätta påverkar `order[]` och `masteredThisSession[]` oavsett position.
- Efter Rätta correct: auto-advance via `setTimeout(nextWord, 800)`.
- Efter Rätta wrong (app): ordet flyttas till slutet, currentIndex pekar redan på nästa. Användaren klickar `[Nästa →]` (eller →).

**Differens mot rättstavning:**

- Rättstavning har INGEN auto-advance på correct — användaren klickar alltid Nästa → manuellt.
- Glosor auto-advancar på correct i app-läge (Johanna-direktiv 2026-10-01: "på rätt så ja det kan vi göra").
- Rättstavning har self-mark även i app-läge (med adaptiv svårighetsgradslogik). Glosor skippar self-mark helt i app-läge.
- Båda har ← Bak / Nästa →.

**Differens mot v6 (samma app, annan version):**

- v6: queue[] + self-mark i BÅDA lägen.
- v7: order[] + currentIndex + auto-advance correct + ← Bak / Nästa →. Self-mark BARA i papper-läge.

---

## v6 Arkitektur (mode-toggle: papper/app, 2026-10-01)

**Bakgrund:** Johanna ville ha samma valfrihet som i `fam-hulten/rattstavning` — kunna välja mellan att öva på papper (befintligt) eller att skriva in översättningen direkt på skärmen (nytt). Mönstret är direkt portat från rättstavning (data-mode="paper"/"app", checkGuess()-förgrening, diff-markering).

**Tekniska ändringar:**

- **HTML (`index.html`):**
  - Mode-toggle infogad mellan `<header>` och `<main class="card">`: två `<button class="mode-opt" data-mode="paper|app">`. Default-active = paper.
  - Input-row återinförd i `.card` efter `audio-indicator`: `<div class="input-row" id="inputRow" hidden>` med `<input id="guessInput">`. `hidden`-attributet = döljd i papper-läge.
  - Subtitle-texten ändrad från "Lyssna, skriv svaret på papper och tryck Rätta..." till "Lyssna, skriv svaret på papper eller direkt på skärmen — välj läge nedan".
  - Cache-bust: `?v=6` → `?v=7` (CSS + JS).
- **JS (`app.js`):**
  - Ny modul-state: `let appMode = 'paper';` + `const MODE_KEY = 'glosor-mode';` (localStorage-persistens).
  - Nya funktioner `loadMode()` / `saveMode()` / `setAppMode(mode)` — togglar UI, hint, input-row, nollställer revealed-state.
  - `checkGuess()` förgrenad på `appMode`:
    - **Paper:** oförändrat från v4 (visar `Svar: <en-answer>`, ingen input-jämförelse).
    - **App:** läser `guessInput.value`, normalize:ar, jämför mot `buildAcceptedAnswers(card)` = `[normalize(card.en), ...card.en_alts.split(',')]`. Rätt → `feedback-correct` + grön + self-mark visas. Fel → bokstav-för-bokstav diff (rätt = vanlig text, fel = `<span class="wrong-letter">`, saknas = `<span class="missing-letter">`) + feedback-wrong + self-mark visas.
  - `renderCard()` rensar `guessInput.value` och sätter fokus på input om app-läge (500ms delay efter SV-audio-start, så tangentbordet hinner upp på skärmen).
  - `guessInput` keydown handler för `Enter` → `checkGuess()` (lokalt — global Enter-handler skippar INPUT-targets).
  - `modeToggle` click-handler → `setAppMode(newMode)` + `renderCard()` (samma ord, nytt läge).
  - localStorage-nyckel `glosor-mode` persisterar valet över sessioner.
- **CSS (`styles.css`):**
  - `.mode-toggle` + `.mode-opt` (aktiv = primary-blå, inaktiv = grå) — portad från rättstavning.
  - `.input-row` + `.guess-input` (fokus-ring primary, mörk-mode-anpassad) — portad från rättstavning.
  - `.wrong-letter` + `.missing-letter` fanns redan (från tidigare v3-implementation) — återanvänds.
  - 480px media query: `.mode-toggle` margin tightare, `.guess-input` fontstorlek ned.
  - Dark mode: `.guess-input` + `.mode-opt` får mörka bakgrundsfärger.
- **SW:** `CACHE_NAME` `glosor-v6` → `glosor-v7` (säkerhets bump — undviker ev. kollision med audio-relaterad v6-cache från tidigare).

**Läge-persistens (v6):**

- localStorage-nyckel: `glosor-mode`, värde: `'paper'` eller `'app'`.
- Läses vid script-start (`loadMode()`), sparas vid varje toggle-byte (`saveMode()` i `setAppMode`).
- Default = `'paper'` om nyckeln saknas (bryter inget för användare som bara vill köra papper-läge).
- localStorage-fel (privacy mode, etc.) hanteras tyst — app faller tillbaka till paper.

**Tangetbord (v6 — samma shortcuts i båda lägen):**

- `Enter` (i input-fältet, app-läge): Rätta
- `Enter` (utanför input, papper-läge): Rätta
- `R` / `r`: Rätt (om revealed)
- `F` / `f`: Fel (om revealed)
- `S` / `s`: Spela SV-audio
- `E` / `e`: Spela EN-audio

**Diff-markering (v6, app-läge fel-svar):**

Samma mönster som rättstavning. Exempel: facit = "Sunday", gissning = "sundag":
- Position 0-3: `Sund` (rätt, vanlig text)
- Position 4: `a` istället för `a`... men matcha... faktiskt "Sunday"[4] = 'a', "sundag"[4] = 'a' → match, men "sundag"[5] = 'g' istället för "Sunday"[5] = 'y' → fel
- Resultat: `Sund` + `<span class="wrong-letter">a</span>` + `<span class="missing-letter">y</span>`

Färgkodning:
- `.wrong-letter`: röd bakgrund (`#fee2e2`), overstruken (`text-decoration: line-through`)
- `.missing-letter`: grön bakgrund (`#dcfce7`), understruken

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

- **2026-10-01**: **v7 — prev/next + drop self-mark i app-läge**
  - ← Bak / Nästa → tillagda (samma mönster som rättstavning).
  - Queue + nextCard() bytt mot order[] + currentIndex + renderCard().
  - checkGuess() förgrenad: paper = oförändrat (facit + self-mark); app = auto-advance på rätt (~0.8s), manuell Nästa på fel (ordet till slutet av order).
  - Self-mark-knappar helt borttagna i app-läge (visas bara i papper-läge).
  - renderProgress() baserad på Set av masteredThisSession (avetade även för ord som flyttats till slutet).
  - SW `CACHE_NAME`: `glosor-v7` → `glosor-v8`
  - README + UPDATE.md uppdaterade
- **2026-10-01**: **v6 — mode-toggle (papper/app)**
  - Mode-toggle infogad: 📝 Papper / ⌨️ App. Default = papper (befintligt beteende).
  - App-läge: input-fält + bokstav-för-bokstav diff-markering vid fel (rätt/fel/saknas), samma mönster som rättstavning.
  - `en_alts`-stöd: alternativa engelska översättningar accepteras (komma-separerade i JSON).
  - localStorage-persistens av valt läge (`glosor-mode`).
  - Subtitle-text uppdaterad.
  - SW `CACHE_NAME`: `glosor-v6` → `glosor-v7`
  - README + UPDATE.md uppdaterade
- **2026-09-15**: **v5 — pronunciation_dict** (verifierat IPA, kort y via dubbel-k)
  - worksheten "Do you like cars?" har `cykel/bike` (inte `cykler/cycles`)
  - IPA verifierat mot sv.wiktionary.org/wiki/cykel (citerar SAOL)
  - `pronunciation_dict.tone` (mmx: `--pronunciation`) löser både c- och y-problem
  - Stavning `sykkel` (norsk) = svenskt fordon-uttal /²sʏkːɛl/ exakt
  - SW `CACHE_NAME`: `glosor-v4` → `glosor-v5`

- **2026-09-15**: **v4 — pappersläge** (input-ruta borttagen)
  - Zacharias skriver på papper → input-rutan + auto-keyboard togs bort
  - `checkGuess()` förenklad till "visa facit"
  - Auto-fokus på Rätt/Fel borttaget (visste inte vad som var rätt utan input)
  - `Enter` flyttad från input-keydown till global handler
  - SW `CACHE_NAME`: `glosor-v3` → `glosor-v4`
  - README + UPDATE.md uppdaterade

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

**Senast uppdaterad:** 2026-09-15 (v5 — pronunciation_dict, IPA-verifierat)
