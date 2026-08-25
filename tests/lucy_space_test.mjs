// Prueba real del Space ZeroGPU decart-ai/lucy-edit-dev (Lucy Edit gratis)
import { Client, handle_file } from '@gradio/client'
import fs from 'fs'
import { execSync } from 'child_process'

async function main() {
  // vídeo de prueba pequeño: 3s, 480p
  execSync('ffmpeg -y -v error -t 3 -i /app/public/videos/4467.mp4 -vf scale=832:468 -c:v libx264 -crf 23 -pix_fmt yuv420p -an /tmp/lucy_in.mp4')
  console.log('video listo:', fs.statSync('/tmp/lucy_in.mp4').size, 'bytes')

  const t0 = Date.now()
  const client = await Client.connect('decart-ai/lucy-edit-dev')
  const api = await client.view_api()
  console.log('endpoints:', Object.keys(api.named_endpoints || {}))

  const videoBlob = new Blob([fs.readFileSync('/tmp/lucy_in.mp4')], { type: 'video/mp4' })
  console.log('enviando job...')
  const result = await client.predict('/process_video', {
    video_path: { video: handle_file(videoBlob), subtitles: null },
    prompt: 'Add a colorful hot air balloon flying in the blue sky',
    negative_prompt: '',
    num_frames: 73,
    auto_resize: true,
    manual_height: 480,
    manual_width: 832,
    guidance_scale: 5,
  })
  console.log('respuesta en', ((Date.now() - t0) / 1000).toFixed(0) + 's:', JSON.stringify(result.data).slice(0, 500))
  const out = result.data?.[0]
  const url = out?.video?.url || out?.url
  if (url) {
    const res = await fetch(url)
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync('/tmp/lucy_out.mp4', buf)
    console.log('descargado /tmp/lucy_out.mp4', buf.length, 'bytes')
  }
}
main().catch((e) => { console.error('FALLO:', e?.message || e, '| cause:', e?.cause, '| stack:', String(e?.stack).slice(0, 600)); process.exit(1) })
