# Glosor Audio Update Guide

**Syfte:** Uppdatera eller utöka audio-filer när nya ord tillkommer eller när någon ska ändra i befintliga.

**Processordning (VIKTIGT — lärdom från 2026-09-01 + 2026-09-08):**

1. **Diskutera FÖRST, generera SEN.** Aldrig `mmx speech synthesize` direkt efter en pushback — diskutera fram rätt approach med användaren.
2. **Lyssna på FÖREGÅENDE audio innan du ändrar något.** Öppna appen på https://fam-hulten.github.io/glosor/ och hör hur orden låter nu.
3. **Verifiera röst-prompten fungerar** med `--dry-run` (eller litet test) innan batch.
4. **Läs ALLTID både SV + EN från worksheten** (läxa 2026-09-08). Eleven ska lära sig SPECIFIKT det ord läraren valt på worksheten — inte en "korrekt" översättning från mitt eget huvud. Om worksheten säger `godis → treat`, är det `treat` som gäller, inte `candy`/`sweets`. **Aldrig gissa översättningar.** Om bilden bara visar SV-kolumnen: fråga Johanna om EN, eller be om bild igen — generera ALDRIG audio med egna översättningar.
   - **Pågående åtgärd:** 'The Family'-temat (13 ord, 2026-09-08) är uppladdat med gissade översättningar. Måste regenereras när worksheten finns tillgänglig igen.

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

## Arkivering av ord (Johanna #14643 + #14647)

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

**Senast uppdaterad:** 2026-09-01 (efter arkiverings-feature)
