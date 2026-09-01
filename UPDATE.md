# Glosor Audio Update Guide

**Syfte:** Uppdatera eller utöka audio-filer när nya ord tillkommer eller när någon ska ändra i befintliga.

**Processordning (VIKTIGT — lärdom från 2026-09-01):**

1. **Diskutera FÖRST, generera SEN.** Aldrig `mmx speech synthesize` direkt efter en pushback — diskutera fram rätt approach med användaren.
2. **Lyssna på FÖREGÅENDE audio innan du ändrar något.** Öppna appen på https://fam-hulten.github.io/glosor/ och hör hur orden låter nu.
3. **Verifiera röst-prompten fungerar** med `--dry-run` (eller litet test) innan batch.

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
