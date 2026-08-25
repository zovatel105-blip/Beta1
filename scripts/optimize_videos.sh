#!/usr/bin/env bash
# Genera posters (primer fotograma) y versiones ligeras de los vídeos del feed.
# - Backup de originales en public/videos_orig (reversible).
# - Poster JPG por vídeo: {id}.jpg (carga instantánea).
# - MP4 optimizado (máx 854px, crf 30, faststart) reemplaza al original.
set -u
VID_DIR="/app/public/videos"
ORIG_DIR="/app/public/videos_orig"
mkdir -p "$ORIG_DIR"

shopt -s nullglob
for src in "$VID_DIR"/*.mp4; do
  base="$(basename "$src" .mp4)"
  orig="$ORIG_DIR/$base.mp4"
  poster="$VID_DIR/$base.jpg"

  # 1) Backup del original (solo una vez)
  if [ ! -f "$orig" ]; then
    cp "$src" "$orig"
  fi

  # Trabajamos siempre desde el ORIGINAL para no recomprimir en cadena.
  input="$orig"

  # 2) Poster (primer fotograma a ~480px de ancho)
  if [ ! -f "$poster" ]; then
    ffmpeg -y -ss 0.1 -i "$input" -frames:v 1 \
      -vf "scale='min(480,iw)':-2" -q:v 4 "$poster" >/dev/null 2>&1
    echo "poster $base.jpg done"
  fi

  # 3) MP4 optimizado (máx 854px, crf 30, faststart, audio 64k)
  tmp="$VID_DIR/$base.opt.mp4"
  ffmpeg -y -i "$input" \
    -vf "scale='if(gt(iw,ih),min(854,iw),-2)':'if(gt(iw,ih),-2,min(854,ih))'" \
    -c:v libx264 -preset veryfast -crf 30 -profile:v high -level 4.0 \
    -maxrate 1200k -bufsize 2400k -pix_fmt yuv420p \
    -c:a aac -b:a 64k -movflags +faststart "$tmp" >/dev/null 2>&1
  if [ -f "$tmp" ] && [ -s "$tmp" ]; then
    mv "$tmp" "$src"
    echo "optimized $base.mp4 done ($(du -h "$src" | cut -f1))"
  else
    rm -f "$tmp"
    echo "FAILED optimize $base.mp4"
  fi
done
echo "ALL_OPTIMIZE_DONE"
