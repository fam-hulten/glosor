#!/usr/bin/env python3
"""
gen_audio.py — Genererar SV + EN audio-filer för glosor-appen

Användning:
    # Förutsätter att mmx auth är konfigurerat (se memory/audio-permanent-fix.md)
    python3 gen_audio.py [--out-dir DIR] [--data-json FILE]

Läser glosor-data.json, genererar 2 MP3-filer per ord (SV + EN) via MiniMax T2A.

Voice IDs (verifierade 2026-09-01, rattstavning/AUDIO-PIPELINE.md):
- SV: Swedish_male_1_v1
- EN: English_expressive_narrator

Prompter (Johanna direktiv, verifierade genom upprepad pushback 2026-09-01):

SV (Johanna #14549 + #14628 + #14631):
    'Skriv ordet #"<ord>"'
    - # fungerar som paus-separator i MiniMax T2A för SV-rösten
    - citationstecken runtom ordet för tydlig avgränsning
    - TEST: paus hörbar, inget "number"-artefakt

EN (Johanna #14628 + #14631):
    'Write the word "<ord>"'
    - UTAN #-tecknet (Engelsk-rösten läser # som "number", INTE paus)
    - citationstecken runtom ordet
    - TEST: inget "number"-artefakt

Auth (memory/audio-permanent-fix.md):
    mmx auth login --api-key "$(cat /tmp/.mmx-key)"  (UTAN --region!)
    mmx-config i /home/node/.mmx/ (sudo + entrypoint-chown krävs)

Exempel:
    python3 gen_audio.py
    python3 gen_audio.py --out-dir /tmp/test-audio --data-json ./glosor-data.json
    python3 gen_audio.py --dry-run
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


# Voice IDs (från rattstavning/AUDIO-PIPELINE.md, verifierade)
VOICE_SV = "Swedish_male_1_v1"
VOICE_EN = "English_expressive_narrator"
MODEL = "speech-2.8-hd"
SPEED = "0.85"


def check_mmx_auth() -> bool:
    """Verifiera att mmx är authad. Returnerar True om auth.status visar method."""
    try:
        r = subprocess.run(
            ["mmx", "auth", "status"],
            capture_output=True, text=True, timeout=10
        )
        if r.returncode != 0:
            return False
        return '"method":' in r.stdout or "method:" in r.stdout
    except Exception as e:
        print(f"  ✗ auth check misslyckades: {e}", file=sys.stderr)
        return False


def synth(text: str, voice: str, out_path: Path) -> bool:
    """Kör mmx speech synthesize. Returnerar True om fil skapades."""
    # V3.2: --language Swedish för SV-röster (löser loanword-problemet).
    # Auto-detect: om voice-namnet innehåller "swedish", sätt --language Swedish.
    language = "Swedish" if "swedish" in voice.lower() else None
    cmd = [
        "mmx", "speech", "synthesize",
        "--text", text,
        "--voice", voice,
        "--model", MODEL,
        "--speed", SPEED,
        "--out", str(out_path),
        "--quiet",
    ]
    if language:
        cmd.extend(["--language", language])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return out_path.exists()
    except Exception as e:
        print(f"  ✗ synth error: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        default="audio",
        help="Output-katalog för MP3-filer (default: audio/)"
    )
    parser.add_argument(
        "--data-json",
        default="glosor-data.json",
        help="JSON med ord (default: glosor-data.json)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Visa vad som skulle genereras utan att köra"
    )
    parser.add_argument(
        "--lang",
        choices=["sv", "en", "both"],
        default="both",
        help="Vilket språk: sv, en eller both (default: both)"
    )
    args = parser.parse_args()

    # Läs data
    data_path = Path(args.data_json)
    if not data_path.exists():
        print(f"✗ Hittar inte {data_path}", file=sys.stderr)
        sys.exit(1)

    with open(data_path) as f:
        data = json.load(f)
    words = data.get("words", [])
    if not words:
        print(f"✗ Inga ord i {data_path}", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    n_total = len(words) * (2 if args.lang == "both" else 1)
    print(f"Genererar {n_total} filer (lang={args.lang})")
    print(f"Output: {out_dir.resolve()}")
    print(f"Voice:  SV={VOICE_SV}, EN={VOICE_EN}, model={MODEL}, speed={SPEED}")
    print()

    # Auth check
    if not args.dry_run:
        if not check_mmx_auth():
            print("✗ mmx auth inte konfigurerad!", file=sys.stderr)
            print('  Kör: mmx auth login --api-key "$(cat /tmp/.mmx-key)"', file=sys.stderr)
            sys.exit(1)
        print("✓ mmx auth OK")
        print()

    # Generera
    ok = fail = 0

    # SV: 'Skriv ordet #"<ord>"' — # funkar som paus-separator för SV-rösten
    if args.lang in ("sv", "both"):
        for w in words:
            wid = w["id"]
            sv = w["sv"]
            out_sv = out_dir / f"{wid}-sv.mp3"
            text_sv = f'Skriv ordet #"{sv}"'  # MED # (paus) + citationstecken
            if args.dry_run:
                print(f"  [dry-run] {out_sv.name}: '{text_sv}'")
                ok += 1
            elif synth(text_sv, VOICE_SV, out_sv):
                print(f"  ✓ {out_sv.name}")
                ok += 1
            else:
                print(f"  ✗ {out_sv.name}")
                fail += 1

    # EN: 'Write the word "<ord>"' — UTAN # (läses som "number" i EN-rösten)
    if args.lang in ("en", "both"):
        for w in words:
            wid = w["id"]
            en = w["en"]
            out_en = out_dir / f"{wid}-en.mp3"
            text_en = f'Write the word "{en}"'  # UTAN # + citationstecken
            if args.dry_run:
                print(f"  [dry-run] {out_en.name}: '{text_en}'")
                ok += 1
            elif synth(text_en, VOICE_EN, out_en):
                print(f"  ✓ {out_en.name}")
                ok += 1
            else:
                print(f"  ✗ {out_en.name}")
                fail += 1

    print()
    print(f"Resultat: {ok}/{n_total} ok, {fail}/{n_total} fail")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
