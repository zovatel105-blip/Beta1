#!/usr/bin/env bash
# FASE 1 (una sola vez): fast start (remux moov al inicio) de los vídeos
# EXISTENTES + regeneración de pósters que falten. NO recodifica calidad.
set -u
cd /app/public || exit 1

echo "== faststart =="
for f in videos/*.mp4 uploads/*.mp4; do
  [ -f "$f" ] || continue
  tmp="${f%.mp4}.__fs.mp4"
  if ffmpeg -y -v error -i "$f" -c copy -movflags +faststart "$tmp" </dev/null 2>/dev/null; then
    mv -f "$tmp" "$f" && echo "ok  $f"
  else
    rm -f "$tmp"; echo "skip $f"
  fi
done

echo "== posters faltantes =="
for f in uploads/*.mp4 videos/*.mp4; do
  [ -f "$f" ] || continue
  jpg="${f%.mp4}.jpg"
  if [ ! -f "$jpg" ]; then
    ffmpeg -y -v error -ss 0.1 -i "$f" -frames:v 1 -vf "scale='min(480,iw)':-2" -q:v 4 "$jpg" </dev/null 2>/dev/null && echo "poster $jpg"
  fi
done

echo "== DONE =="
