#!/usr/bin/env bash
# Regenerates the spoken fixtures for the voice eval and the Playwright fake microphone:
# one 16 kHz, 16-bit, mono PCM WAV per case in src/cases/voice.json (plus barge-in follow-ups),
# spoken by a macOS system voice per language. macOS only (`say`, `afconvert`).
#   packages/ai-eval/scripts/make-voice-fixtures.sh
set -euo pipefail
cd "$(dirname "$0")/.."
out=fixtures/voice
mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# id <TAB> voice <TAB> text, from the cases file (node only reads it).
node -e '
  const { voices, cases } = JSON.parse(require("fs").readFileSync("src/cases/voice.json", "utf8"));
  for (const c of cases) {
    console.log([c.id, voices[c.language], c.say].join("\t"));
    if (c.bargeIn) console.log([c.bargeIn.id, voices[c.language], c.bargeIn.say].join("\t"));
  }
  // The Playwright fake microphone loops its file: speech, then 2 s of silence, so the
  // scripted mock voice provider hears one turn per loop.
  console.log(["e2e-mic", voices.en, "Books by Tolkien, please. [[slnc 2000]]"].join("\t"));
' | while IFS=$'\t' read -r id voice text; do
  say -v "$voice" -o "$tmp/$id.aiff" -- "$text"
  afconvert -f WAVE -d LEI16@16000 -c 1 "$tmp/$id.aiff" "$out/$id.wav"
  echo "$out/$id.wav ($voice)"
done
