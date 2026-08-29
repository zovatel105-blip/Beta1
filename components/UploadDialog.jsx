'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState en efectos de carga/reset async; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Loader2, Film, Swords, Users, Rows2, Columns2, ArrowLeft, X, Search, Music, Sparkles, RefreshCw, Globe, Camera } from 'lucide-react'
import Avatar from './Avatar'
import MusicPicker from './MusicPicker'
import AIImageEditor from './AIImageEditor'
import AIVideoEditor from './AIVideoEditor'
import { addPendingUpload, updateUploadProgress, removePendingUpload, markUploadFailed } from '@/lib/uploadQueue'
import { captureThumbnail } from '@/lib/mediaThumbnail'

/**
 * UploadDialog — flujo multi-paso para crear publicaciones de votación: Versus
 * (2 vídeos A/B), 1vs1 (2 vídeos A/B con formato) o Reto (tu vídeo + elegir a quién retar).
 * Diseño premium minimalista (móvil) con vista previa a pantalla completa.
 */
const GOLD = '#FFFFFF'

// Tipo de un archivo seleccionado: 'image' | 'video' | ''.
const fileKind = (f) => {
  const t = f && f.type ? f.type : ''
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  return ''
}

export default function UploadDialog({ open, initialMode, luxuryTheme, onClose, onUploaded, onChallengeCreated }) {
  const inputRef = useRef(null)
  const inputBRef = useRef(null)
  // Inputs SEPARADOS para la cámara (petición del usuario: "solo existe
  // subir desde galería, no hay opción de hacer foto/grabar desde el
  // dispositivo"). Mismo <input type="file"> de siempre pero con
  // `capture="environment"` — en navegadores móviles reales (Chrome/Safari,
  // que es donde el usuario confirmó que prueba la app) esto abre la cámara
  // nativa DIRECTAMENTE (foto o vídeo, el propio selector de cámara del
  // sistema deja elegir el modo) en vez del selector de archivos/galería.
  const cameraInputRef = useRef(null)
  const cameraInputBRef = useRef(null)
  const versusTouchX = useRef(0)
  const [step, setStep] = useState('mode') // mode | layout | target | file
  const [mode, setMode] = useState(null) // 'versus' | 'duet' | 'challenge'
  const [layout, setLayout] = useState('horizontal') // 'horizontal' | 'vertical'
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userQuery, setUserQuery] = useState('')
  const [target, setTarget] = useState(null) // usuario al que retar
  const [file, setFile] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState('solo')
  // "Allow challenge" (petición del usuario: poder activar/desactivar el
  // botón de retar en las publicaciones tipo "Your post"). Solo aplica al
  // modo 'solo' (reto abierto) — por defecto ACTIVADO, mismo comportamiento
  // que la app tuvo siempre antes de esta opción. También editable después
  // de publicada (ver OpenChallengeSlide.jsx/OptionsModal.jsx).
  const [allowChallenge, setAllowChallenge] = useState(true)
  const [music, setMusic] = useState(null) // track de iTunes seleccionado
  const [musicOpen, setMusicOpen] = useState(false)
  const [previewA, setPreviewA] = useState(null)
  const [previewB, setPreviewB] = useState(null)
  const [versusIdx, setVersusIdx] = useState(0) // slide activo en la vista previa carrusel (versus)
  // Breve estado de feedback en el botón mientras se genera la miniatura local
  // (paso previo, ~instantáneo) y se cierra el diálogo; la subida real ya no
  // se espera aquí (continúa en segundo plano, ver doUpload).
  const [publishing, setPublishing] = useState(false)
  // Editor de fotos con IA (ver AIImageEditor.jsx): null = cerrado, 0 = editando
  // el archivo del slot A / foto única, 1 = editando el archivo del slot B.
  const [aiEditorSlot, setAiEditorSlot] = useState(null)
  // Estado del editor de IA "en el mismo sitio" — { status: 'loading'|'result', url? }
  // null cuando no hay generación en curso ni resultado pendiente para el
  // slot activo. Ver AIImageEditor.jsx (onStatusChange).
  const [aiOverride, setAiOverride] = useState(null)

  // URLs de previsualización memorizadas (evita recrearlas en cada render,
  // lo que reiniciaría el vídeo al escribir la descripción).
  useEffect(() => {
    if (!file) { setPreviewA(null); return }
    const url = URL.createObjectURL(file)
    setPreviewA(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    if (!fileB) { setPreviewB(null); return }
    const url = URL.createObjectURL(fileB)
    setPreviewB(url)
    return () => URL.revokeObjectURL(url)
  }, [fileB])

  const reset = () => {
    setStep('mode'); setMode(null); setLayout('horizontal'); setTarget(null); setUsers([])
    setFile(null); setFileB(null); setDescription(''); setError(null); setPublishing(false)
    setSelected('solo'); setVersusIdx(0); setMusic(null); setMusicOpen(false); setAiEditorSlot(null); setAiOverride(null); setAllowChallenge(true)
  }

  useEffect(() => {
    if (!open) { reset(); return }
    // BUG FIX (usuario: 'ahora funciona pero tiene que dirigirme directamente
    // a retos no versus'): al abrir desde el botón 'Create a challenge'/'Add
    // challenge' de la página de Retos, el diálogo mostraba siempre el
    // selector Versus/1vs1/Retos empezando en 'Versus' -> el usuario tenía que
    // cambiar manualmente a la pestaña 'Retos' y pulsar 'Continue'. Si se abre
    // con initialMode='challenge' (ver Feed.jsx requestUpload), se salta el
    // selector por completo y se entra DIRECTAMENTE al flujo de Retos (mismo
    // efecto que si el usuario ya hubiera elegido 'Retos' y pulsado
    // 'Continue'). Cualquier otro caso (initialMode null/'versus'/'duet')
    // mantiene el comportamiento previo (mostrar el selector).
    if (initialMode === 'challenge') {
      setSelected('challenge')
      setMode('challenge')
      setStep('file')
    } else if (initialMode === 'versus' || initialMode === 'duet') {
      setSelected(initialMode)
    }
  }, [open])

  // Carga la lista de creadores al entrar en el paso 'target' (a quién retar).
  useEffect(() => {
    if (step !== 'target') return
    setUsersLoading(true)
    setUserQuery('')
    fetch('/api/users', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false))
  }, [step])

  const pickFile = () => inputRef.current?.click()
  const pickFileB = () => inputBRef.current?.click()
  const pickCamera = () => cameraInputRef.current?.click()
  const pickCameraB = () => cameraInputBRef.current?.click()

  // Versus: cambiar entre vídeo A / B deslizando (un toque sin movimiento abre el selector).
  const onVersusTouchStart = (e) => { versusTouchX.current = e.touches[0]?.clientX ?? 0 }
  const onVersusTouchEnd = (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - versusTouchX.current
    if (dx < -40) setVersusIdx(1)
    else if (dx > 40) setVersusIdx(0)
  }

  const handleFileChange = (slot) => (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const kind = fileKind(f)
    if (kind !== 'image' && kind !== 'video') { setError('Select a video or photo'); return }
    // No mezclar: el otro lado debe ser del mismo tipo (2 vídeos o 2 fotos).
    const other = slot === 'b' ? file : fileB
    const otherKind = fileKind(other)
    if (otherKind && otherKind !== kind) {
      setError('Both must be the same type (2 videos or 2 photos)')
      return
    }
    const maxMB = kind === 'image' ? 15 : 80
    if (f.size > maxMB * 1024 * 1024) { setError(`Maximum ${maxMB}MB`); return }
    setError(null)
    if (slot === 'b') setFileB(f)
    else setFile(f)
  }

  const goToTarget = () => {
    if (!file) { setError('Upload your challenge video or photo'); return }
    setError(null)
    setStep('target')
  }

  const doUpload = async (targetUser) => {
    const tgt = targetUser || target
    if (mode === 'versus' || mode === 'duet') {
      if (!file || !fileB) { setError('Upload both videos (A and B)'); return }
    } else if (mode === 'challenge') {
      if (!file) { setError('Upload your video'); return }
      if (!tgt) { setError('Choose who to challenge'); return }
    } else if (!file) {
      return
    }
    if (publishing) return
    setError(null)
    setPublishing(true)

    // Id local de la subida (para el placeholder del grid de perfil y el
    // seguimiento de progreso, ver lib/uploadQueue.js).
    const uploadId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `up_${Date.now()}_${Math.random().toString(36).slice(2)}`

    // Bug reportado por el usuario ("las publicaciones single no aparecen
    // publicandose en segundo plano"): a diferencia de versus/1vs1 (que
    // publican una publicación INMEDIATA, visible en el propio grid en
    // cuanto se sube), un reto DIRIGIDO (`challenge`) no crea nada hasta que
    // el retado lo acepta -> no tiene sentido mostrarle un placeholder en SU
    // grid. PERO un reto ABIERTO/"Single" (`solo`) SÍ es una publicación
    // inmediata y visible para cualquiera (incluido su propio creador) en
    // cuanto se sube -mismo criterio que versus/1vs1-, así que también debe
    // mostrar el placeholder de "subiendo…" -antes se quedaba fuera junto a
    // `challenge` por error, dejando al usuario sin NINGÚN indicio visual de
    // que la subida seguía en curso en segundo plano.
    const showsInProfileGrid = mode === 'versus' || mode === 'duet' || mode === 'solo'
    if (showsInProfileGrid) {
      // Mejor esfuerzo: miniatura local (lado A) para el placeholder. Se
      // limita a ~2.5s (ver mediaThumbnail.js) para no retrasar el cierre.
      const thumbUrl = await captureThumbnail(file)
      addPendingUpload({ id: uploadId, mode, thumbUrl })
    }

    // Cerrar el diálogo YA: la subida real continúa en segundo plano (este
    // componente sigue montado -aunque oculto- mientras Feed.jsx mantenga
    // `uploadOpen` en su árbol, así que el XHR no se interrumpe al cerrar).
    onClose()

    try {
      const xhr = new XMLHttpRequest()
      xhr.withCredentials = true // Incluir cookies en la petición
      const promise = new Promise((resolve, reject) => {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100)
            if (showsInProfileGrid) updateUploadProgress(uploadId, pct)
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) } catch (err) { reject(err) }
          } else reject(new Error('upload failed ' + xhr.status))
        }
        xhr.onerror = () => reject(new Error('network'))
      })
      const fd = new FormData()
      if (mode === 'duet') {
        xhr.open('POST', '/api/duet')
        fd.append('fileA', file)
        fd.append('fileB', fileB)
        fd.append('layout', layout)
        fd.append('description', description || '')
      } else if (mode === 'solo') {
        // Publicación ÚNICA (un solo vídeo/foto, sin destinatario concreto):
        // internamente reutiliza el mismo endpoint de retos con
        // openChallenge=1 -> aparece en el feed principal con un botón
        // "Challenge" y en el grid de perfil de su creador (ver
        // getOpenChallengeFeedItems, route.js). NO puede llevar tema de
        // "Luxury Battle" (petición del usuario: "las publicaciones single
        // no deben estar en las batallas porque solo existen para ser
        // retadas") — solo los retos DIRIGIDOS (mode 'challenge') lo llevan.
        xhr.open('POST', '/api/challenges')
        fd.append('file', file)
        fd.append('openChallenge', '1')
        fd.append('message', description || '')
        fd.append('allowChallenge', allowChallenge ? '1' : '0')
      } else if (mode === 'challenge') {
        xhr.open('POST', '/api/challenges')
        fd.append('file', file)
        fd.append('targetAuthor', JSON.stringify(tgt))
        fd.append('message', description || '')
        // "Luxury Battle" (petición del usuario): si se entró a este reto
        // desde la hoja LuxuryBattleSheet ("Enter with an AI photo"), se
        // adjunta el id del tema activo — el post resultante al aceptarse
        // heredará esta etiqueta y competirá en su leaderboard (ver
        // handleAcceptChallenge/scoreLuxuryBattlePost, route.js).
        if (luxuryTheme?.id) fd.append('luxuryThemeId', luxuryTheme.id)
      } else {
        xhr.open('POST', '/api/versus')
        fd.append('fileA', file)
        fd.append('fileB', fileB)
        fd.append('description', description || '')
      }
      // Música seleccionada (iTunes): se adjunta en cualquier modo.
      if (music?.previewUrl) {
        fd.append('musicTitle', music.title || '')
        fd.append('musicArtist', music.artist || '')
        fd.append('musicArtwork', music.artwork || '')
        fd.append('musicPreviewUrl', music.previewUrl || '')
        fd.append('musicTrackId', String(music.id || ''))
      }
      // Respaldo por token Bearer (además de la cookie withCredentials): si el
      // navegador bloquea la cookie dentro del iframe, el token autentica igual.
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('twyk_token') : null
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      } catch { /* ignore */ }
      xhr.send(fd)
      const data = await promise
      if (showsInProfileGrid) removePendingUpload(uploadId)
      if (mode === 'solo') {
        // Réplica del criterio de versus/1vs1 (onUploaded inserta la
        // publicación real al instante en el grid del propio perfil, sin
        // esperar a un refetch, vía el evento global 'twyk:postCreated' -
        // ver ProfilePage.jsx) construyendo un objeto con la MISMA forma
        // exacta que ya arma el backend para esta tarjeta en el feed
        // (getOpenChallengeFeedItems, route.js) a partir de `data.challenge`
        // (todo lo que esa función necesita ya viene en la respuesta de
        // POST /api/challenges: from/challengerMediaType/challengerVideoUrl
        // etc.). Antes solo se llamaba a onChallengeCreated() (pensado para
        // refrescar la bandeja de Retos Activos, que no aplica aquí), así
        // que ni el placeholder desaparecía correctamente ni la publicación
        // real llegaba a verse hasta recargar el perfil manualmente.
        if (onUploaded) {
          const c = data?.challenge
          if (c) {
            const mt = c.challengerMediaType || (c.challengerImageUrl ? 'image' : 'video')
            onUploaded({
              id: `open_${c.id}`,
              type: 'challenge_open',
              challengeId: c.id,
              mediaType: mt,
              videoUrl: mt === 'video' ? (c.challengerVideoUrl || '') : '',
              imageUrl: mt === 'image' ? (c.challengerImageUrl || '') : '',
              posterUrl: c.challengerPosterUrl || '',
              author: c.from,
              description: c.message || '',
              music: c.musicTitle ? `${c.musicTitle} · ${c.musicArtist}` : 'Open challenge',
              stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
              createdAtMs: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
              allowChallenge: c.allowChallenge !== false,
            })
          }
        }
        if (onChallengeCreated) onChallengeCreated()
      } else if (mode === 'challenge') {
        if (onChallengeCreated) onChallengeCreated()
      } else if (onUploaded && data?.post) {
        onUploaded(data.post)
      }
    } catch (err) {
      console.error(err)
      if (showsInProfileGrid) markUploadFailed(uploadId)
    }
  }

  if (!open) return null

  const goBack = () => {
    if (step === 'target') setStep('file')
    else if (step === 'file') setStep('mode')
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0b] flex flex-col text-white">
      {/* Glow superior sutil */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.07), transparent 70%)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-3"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center gap-1">
          {step !== 'mode' ? (
            <button onClick={goBack} aria-label="Back" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition">
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
          ) : (
            <span className="w-1.5" />
          )}
          <h1 className="text-[17px] font-semibold tracking-tight">
            {step === 'mode' && 'Create content'}
            {step === 'layout' && 'Choose the format'}
            {step === 'target' && 'Choose who to challenge'}
            {step === 'file' && (mode === 'versus' ? 'Your 2 videos' : mode === 'challenge' ? 'Your challenge' : mode === 'solo' ? 'Your post' : 'Your 1vs1')}
          </h1>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-zinc-400 hover:text-white">
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pt-2 pb-10">
        {/* STEP: mode — control segmentado (estilo referencia) */}
        {step === 'mode' && (
          <div className="max-w-md mx-auto w-full min-h-full flex flex-col">
            {/* Control segmentado — petición del usuario: "ocultar el
                botón de versus y 1vs1 y poner open antes que challenge".
                Versus/1 vs 1 NO se borran del código (mode 'versus'/'duet'
                siguen funcionando si se entra por otra vía, ej.
                initialMode), solo se ocultan estos 2 botones aquí; el
                orden visible pasa a ser Open, Challenges. */}
            <div className="flex justify-center mt-2 mb-2">
              <div className="inline-flex p-1 rounded-full bg-white/[0.06] border border-white/10">
                <button
                  onClick={() => setSelected('solo')}
                  className={`px-3.5 py-2 rounded-full text-[13px] font-semibold transition ${selected === 'solo' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
                >
                  {/* Renombrado "Single" -> "Open" -> "Post" (petición del
                      usuario: "single debe cambiar por publicar ... en
                      inglés" — traducción usada: "Post", equivalente en
                      inglés de "Publicar") — SOLO el texto visible cambia,
                      `mode === 'solo'` y el resto del código quedan intactos. */}
                  Post
                </button>
                <button
                  onClick={() => setSelected('challenge')}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition ${selected === 'challenge' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
                >
                  {/* Renombrado "Challenges" -> "Direct" (petición del
                      usuario: "challenge por directo ... en inglés" —
                      traducción usada: "Direct", ya que este modo es un
                      reto DIRIGIDO/directo a una persona concreta, a
                      diferencia de "Post"/Open que queda abierto a
                      cualquiera) — SOLO el texto visible cambia,
                      `mode === 'challenge'` y el resto del código quedan
                      intactos. */}
                  Direct
                </button>
              </div>
            </div>

            {/* Preview del modo seleccionado — centrado y ocupando el alto disponible */}
            <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
              <div
                className="w-24 h-24 rounded-[28px] bg-white/[0.04] border border-white/10 flex items-center justify-center mb-7"
                style={{ boxShadow: '0 0 60px -14px rgba(255,255,255,0.45)' }}
              >
                {selected === 'versus' && <Film className="w-11 h-11" strokeWidth={1.25} style={{ color: GOLD }} />}
                {selected === 'duet' && <Users className="w-11 h-11" strokeWidth={1.25} style={{ color: GOLD }} />}
                {selected === 'challenge' && <Swords className="w-11 h-11" strokeWidth={1.25} style={{ color: GOLD }} />}
                {selected === 'solo' && <Globe className="w-11 h-11" strokeWidth={1.25} style={{ color: GOLD }} />}
              </div>

              <p className="text-zinc-400 text-[15px] max-w-[19rem] leading-relaxed">
                {selected === 'versus' && 'Upload 2 videos (A and B) and let people vote by swiping between them.'}
                {selected === 'duet' && 'Upload 2 videos (A and B) in the format you choose and let people vote who wins.'}
                {selected === 'challenge' && 'Upload your video or photo and challenge a creator. It will appear in their active challenges to accept.'}
                {selected === 'solo' && 'Upload just ONE video or photo — no need for a second one. Anyone can challenge you on it, and you can vote on it too.'}
              </p>

              {/* Mini ilustración del formato */}
              {selected === 'challenge' ? (
                <div className="mt-10 flex items-center gap-4">
                  <div className="w-20 h-28 rounded-2xl border border-white/[0.08] bg-white/[0.06] flex items-center justify-center text-white/80 text-[12px] font-bold">YOU</div>
                  <span className="text-white/60 font-black text-base">VS</span>
                  <div className="w-20 h-28 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-center text-white/40 text-[12px] font-bold">RIVAL</div>
                </div>
              ) : selected === 'solo' ? (
                <div className="mt-10 relative">
                  <div className="w-24 h-32 rounded-2xl border border-white/[0.08] bg-white/[0.06] flex items-center justify-center text-white/80 text-[13px] font-bold">YOU</div>
                  <span className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-white" strokeWidth={1.75} />
                  </span>
                </div>
              ) : (
                <div className="mt-10 w-48 h-32 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2.5 flex gap-2.5">
                  <div className="flex-1 rounded-xl bg-white/10 flex items-center justify-center text-white/70 text-base font-bold">A</div>
                  <div className="flex-1 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/50 text-base font-bold">B</div>
                </div>
              )}
            </div>

            {/* Botón fijado abajo */}
            <button
              onClick={() => {
                if (selected === 'versus') { setMode('versus'); setStep('file') }
                else if (selected === 'duet') { setMode('duet'); setStep('file') }
                else if (selected === 'solo') { setMode('solo'); setStep('file') }
                else { setMode('challenge'); setStep('file') }
              }}
              className="mt-4 mb-2 w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition"
            >
              Continue
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* STEP: target — elegir a quién retar (después de subir tu vídeo) */}
        {step === 'target' && (() => {
          const q = userQuery.trim().toLowerCase()
          const filteredUsers = q
            ? users.filter((u) =>
                (u.username || '').toLowerCase().includes(q) ||
                (u.name || '').toLowerCase().includes(q)
              )
            : users
          return (
          <div className="max-w-md mx-auto">
            <p className="text-[13px] text-zinc-500 mb-4">Choose who to challenge. It will appear in their active challenges to accept.</p>

            {/* Buscador de usuarios */}
            <div className="flex items-center gap-2.5 h-11 px-4 rounded-full bg-white/[0.04] border border-white/10 focus-within:border-white/30 transition mb-4">
              <Search className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search user by name or @username"
                className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder:text-zinc-500 focus:outline-none"
              />
              {userQuery && (
                <button onClick={() => setUserQuery('')} aria-label="Clear" className="shrink-0 text-zinc-500 hover:text-white transition">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {usersLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-zinc-400" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-14 px-4">
                <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-zinc-500" strokeWidth={1.5} />
                </div>
                <p className="text-white font-semibold text-[15px]">No users to challenge yet</p>
                <p className="text-zinc-500 text-[13px] mt-1">When more creators sign up, they'll appear here.</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-zinc-400 text-[14px]">No results for “{userQuery}”.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((u) => (
                  <button
                    key={u.username}
                    onClick={() => { setTarget(u); doUpload(u) }}
                    disabled={publishing}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/40 active:scale-[0.99] transition text-left disabled:opacity-50"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden ring-1 ring-white/10 shrink-0 bg-zinc-800">
                      <Avatar src={u.avatarUrl} className="w-full h-full rounded-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold truncate">{u.name || u.username}</div>
                      <div className="text-[12px] text-zinc-500 truncate">@{u.username}</div>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full text-black shrink-0" style={{ background: GOLD }}>
                      <Swords size={13} strokeWidth={2.2} /> Challenge
                    </span>
                  </button>
                ))}
              </div>
            )}
            {error && <div className="text-xs text-rose-400 mt-4">{error}</div>}
          </div>
          )
        })()}

        {/* STEP: file — vista previa a PANTALLA COMPLETA */}
        {step === 'file' && (
          <div className="fixed inset-0 z-30 bg-black flex flex-col">
            <input ref={inputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileChange('a')} />
            <input ref={inputBRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileChange('b')} />
            <input ref={cameraInputRef} type="file" accept="video/*,image/*" capture="environment" className="hidden" onChange={handleFileChange('a')} />
            <input ref={cameraInputBRef} type="file" accept="video/*,image/*" capture="environment" className="hidden" onChange={handleFileChange('b')} />

            {/* "Luxury Battle" — banner del tema activo (petición del
                usuario, ver LuxuryBattleSheet.jsx) — SOLO en retos
                DIRIGIDOS (mode 'challenge'); los retos ABIERTOS ('solo')
                nunca llevan tema (petición del usuario: "las publicaciones
                single no deben estar en las batallas porque solo existen
                para ser retadas"). Puramente informativo, no bloquea nada. */}
            {mode === 'challenge' && luxuryTheme && (
              <div className="absolute top-0 left-0 right-0 z-40 flex justify-center px-4"
                   style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold backdrop-blur-md"
                     style={{ background: 'rgba(252,211,77,0.15)', border: '1px solid rgba(252,211,77,0.35)', color: '#FCD34D' }}>
                  🔥 Trending Challenge: {luxuryTheme.title}
                </div>
              </div>
            )}

            {(() => {
              const isAB = mode === 'versus' || mode === 'duet'

              // Una mitad del split (lado A o B): vídeo o estado para subir.
              const renderSlot = (idx, rootClass = 'relative flex-1 min-h-0 min-w-0 overflow-hidden bg-black') => {
                const url = idx === 0 ? previewA : previewB
                const pick = idx === 0 ? pickFile : pickFileB
                const label = idx === 0 ? 'A' : 'B'
                const slotFile = idx === 0 ? file : fileB
                const isImg = fileKind(slotFile) === 'image'
                // Editor de IA "en el mismo sitio" (usuario: 'no debe abrir
                // otra pagina debe editarse desde el mismo sitio'): mientras
                // se está generando o ya hay un resultado para ESTE slot, la
                // miniatura mostrada aquí mismo cambia (spinner / foto
                // editada) en vez de navegar a una pantalla nueva — ver
                // AIImageEditor.jsx (ahora una hoja inferior de controles,
                // sin su propia vista de foto).
                const ov = aiEditorSlot === idx ? aiOverride : null
                const displayUrl = ov?.status === 'result' ? ov.url : url
                const isGenerating = ov?.status === 'loading'
                // ¿Este slot toca el borde superior de la pantalla? (versus:
                // siempre, solo se ve un slot a pantalla completa; 1vs1
                // vertical -izq/der-: ambos slots tocan arriba; 1vs1
                // horizontal -arriba/abajo-: solo el slot A). Solo cuando
                // toca arriba hace falta bajar el botón para no quedar
                // debajo del header propio de este paso (position:relative
                // z-20, ver más abajo) — que de otro modo se roba el click
                // (BUG reportado: 'el boton editar con ia no funciona' — su
                // z-10 anterior + top-2 quedaba TAPADO por ese header, que
                // ocupa todo el ancho con z-20 encima).
                const touchesTop = mode !== 'duet' || layout === 'vertical' || idx === 0
                return (
                  <div className={rootClass}>
                    {url ? (
                      isImg ? (
                        <img key={label + displayUrl} src={displayUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <video key={label + displayUrl} src={displayUrl} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                      )
                    ) : (
                      <>
                        <button onClick={pick} className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 bg-white/[0.02] active:bg-white/[0.06] transition">
                          <div className="w-12 h-12 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center">
                            <Film size={22} strokeWidth={1.5} className="text-zinc-300" />
                          </div>
                          <span className="text-[13px] font-medium text-zinc-200">Upload photo or video</span>
                          <span className="text-[10px] text-zinc-500">Video (max 80MB) · Photo (max 15MB)</span>
                        </button>
                        {/* Botón de cámara — abre la cámara del dispositivo
                            DIRECTAMENTE (foto o vídeo), separado del botón de
                            galería de arriba (petición del usuario). */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); (idx === 0 ? pickCamera : pickCameraB)() }}
                          aria-label="Take photo or record video"
                          className="absolute z-10 bottom-3 right-3 w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-90 transition"
                        >
                          <Camera size={19} strokeWidth={2} />
                        </button>
                      </>
                    )}
                    {isGenerating && (
                      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 pointer-events-none">
                        <Loader2 size={26} className="animate-spin text-white" />
                        <span className="text-[12.5px] font-medium text-zinc-200">Editing with AI…</span>
                      </div>
                    )}
                    {ov?.status === 'result' && (
                      <span className="absolute left-2 z-20 inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/15"
                            style={{ top: touchesTop ? 'calc(max(env(safe-area-inset-top), 14px) + 54px)' : '0.5rem' }}>
                        <Sparkles size={11} /> AI result
                      </span>
                    )}
                    {url && (
                      <div
                        className="absolute right-3 z-20 flex flex-col items-center gap-2"
                        style={{ top: touchesTop ? 'calc(max(env(safe-area-inset-top), 14px) + 58px)' : '0.5rem' }}
                      >
                        {/* Botones CIRCULARES bajo la X (petición del usuario),
                            mismo estilo w-9 bg-black/35 que la X del header.
                            Editor IA: OCULTO para vídeos por ahora ('Por ahora
                            oculta el boton de editar video') — todo el flujo de
                            vídeo (AIVideoEditor, endpoints, GPU gratuita) sigue
                            implementado; para reactivarlo, quitar isImg. */}
                        {isImg && (
                          <button
                            onClick={() => setAiEditorSlot(idx)}
                            aria-label="Edit with AI"
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition text-white"
                          >
                            <Sparkles size={17} strokeWidth={1.9} />
                          </button>
                        )}
                        <button
                          onClick={pick}
                          aria-label="Change media"
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition text-white"
                        >
                          <RefreshCw size={17} strokeWidth={1.9} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              }

              return (
                <>
                  {/* Media: dueto = split con formato; versus = carrusel (1 vídeo a la vez); reto = vídeo único */}
                  {mode === 'duet' ? (
                    <div
                      className={`absolute inset-0 flex bg-white/20 ${layout === 'vertical' ? 'flex-row' : 'flex-col'}`}
                      style={{ gap: '2px' }}
                    >
                      {renderSlot(0)}
                      {renderSlot(1)}
                    </div>
                  ) : mode === 'versus' ? (
                    <div
                      className="absolute inset-0 overflow-hidden bg-black"
                      onTouchStart={onVersusTouchStart}
                      onTouchEnd={onVersusTouchEnd}
                    >
                      {renderSlot(versusIdx, 'relative w-full h-full overflow-hidden bg-black')}
                    </div>
                  ) : (
                    <div className="absolute inset-0">
                      {previewA ? (
                        (() => {
                          const singleOv = aiEditorSlot === 0 ? aiOverride : null
                          const singleDisplayUrl = singleOv?.status === 'result' ? singleOv.url : previewA
                          return fileKind(file) === 'image' ? (
                            <img key={singleDisplayUrl} src={singleDisplayUrl} alt="" draggable={false} className="w-full h-full object-cover" />
                          ) : (
                            <video key={singleDisplayUrl} src={singleDisplayUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                          )
                        })()
                      ) : (
                        <>
                          <button onClick={pickFile} className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white/[0.02] active:bg-white/[0.05] transition">
                            <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/[0.05] flex items-center justify-center">
                              <Film size={28} strokeWidth={1.5} className="text-zinc-300" />
                            </div>
                            <span className="text-[15px] font-medium text-zinc-200">Tap to upload your photo or video</span>
                            <span className="text-[11px] text-zinc-500">Video (max 80MB) · Photo (max 15MB)</span>
                          </button>
                          {/* Botón de cámara — abre la cámara del dispositivo
                              DIRECTAMENTE (foto o vídeo) en vez del selector
                              de galería (petición del usuario: "no hay
                              función de hacer foto/grabar desde el
                              dispositivo"), estilo TikTok/Instagram: botón
                              circular prominente sobre el área de subida. */}
                          <button
                            type="button"
                            onClick={pickCamera}
                            aria-label="Take photo or record video"
                            className="absolute z-10 bottom-6 right-6 w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-xl active:scale-90 transition"
                          >
                            <Camera size={26} strokeWidth={2} />
                          </button>
                        </>
                      )}
                      {aiEditorSlot === 0 && aiOverride?.status === 'loading' && (
                        <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 pointer-events-none">
                          <Loader2 size={26} className="animate-spin text-white" />
                          <span className="text-[12.5px] font-medium text-zinc-200">Editing with AI…</span>
                        </div>
                      )}
                      {previewA && (
                        <div
                          className="absolute right-3 z-20 flex flex-col items-center gap-2"
                          style={{ top: 'calc(max(env(safe-area-inset-top), 14px) + 58px)' }}
                        >
                          {/* Botones CIRCULARES bajo la X (mismo estilo que la X
                              del header). Editor IA: OCULTO para vídeos por
                              ahora (ver nota en renderSlot) — solo en fotos. */}
                          {fileKind(file) === 'image' && (
                            <button
                              onClick={() => setAiEditorSlot(0)}
                              aria-label="Edit with AI"
                              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition text-white"
                            >
                              <Sparkles size={17} strokeWidth={1.9} />
                            </button>
                          )}
                          <button
                            onClick={pickFile}
                            aria-label="Change media"
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition text-white"
                          >
                            <RefreshCw size={17} strokeWidth={1.9} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Degradados para legibilidad */}
                  <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/85 via-black/30 to-transparent pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black via-black/65 to-transparent pointer-events-none" />

                  {/* Header propio (con el conmutador de formato centrado en 1vs1) */}
                  <div className="relative z-20 flex items-center justify-between gap-2 px-3"
                       style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: '10px' }}>
                    <button onClick={goBack} aria-label="Back" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition">
                      <ArrowLeft size={20} strokeWidth={1.75} />
                    </button>
                    {mode === 'duet' ? (
                      <div className="inline-flex p-1 rounded-full bg-black/45 backdrop-blur border border-white/10">
                        <button
                          onClick={() => setLayout('horizontal')}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition ${layout === 'horizontal' ? 'bg-white text-black' : 'text-white/85'}`}
                        >
                          <Rows2 size={14} /> Horizontal
                        </button>
                        <button
                          onClick={() => setLayout('vertical')}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition ${layout === 'vertical' ? 'bg-white text-black' : 'text-white/85'}`}
                        >
                          <Columns2 size={14} /> Vertical
                        </button>
                      </div>
                    ) : (
                      <span className="w-9" />
                    )}
                    <button onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition text-zinc-200">
                      <X size={20} strokeWidth={1.75} />
                    </button>
                  </div>

                  {/* Versus: la vista previa es un carrusel; se cambia de vídeo con swipe (ver puntitos abajo) */}

                  {/* Panel inferior: mismo sitio de siempre — normalmente
                      descripción/música/publicar; mientras se edita una foto
                      o vídeo con IA (aiEditorSlot !== null) este MISMO panel
                      muestra los controles de AIImageEditor/AIVideoEditor en
                      su lugar (usuario: 'tampoco debe ser desde un modal' ->
                      ya no hay overlay de ningún tipo, es contenido normal
                      de este panel). */}
                  <div className="relative z-20 mt-auto px-4 space-y-3"
                       style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}>
                    {aiEditorSlot !== null ? (
                      fileKind(aiEditorSlot === 0 ? file : fileB) === 'video' ? (
                        <AIVideoEditor
                          videoFile={aiEditorSlot === 0 ? file : fileB}
                          onStatusChange={(status, url) => setAiOverride(status ? { status, url } : null)}
                          onClose={() => { setAiEditorSlot(null); setAiOverride(null) }}
                          onApply={(newFile) => {
                            if (aiEditorSlot === 0) setFile(newFile)
                            else if (aiEditorSlot === 1) setFileB(newFile)
                            setAiEditorSlot(null)
                            setAiOverride(null)
                          }}
                        />
                      ) : (
                        <AIImageEditor
                          imageFile={aiEditorSlot === 0 ? file : fileB}
                          initialPrompt={aiEditorSlot === 0 && mode === 'challenge' ? (luxuryTheme?.promptHint || '') : ''}
                          showStyleGallery={mode === 'solo'}
                          onStatusChange={(status, url) => setAiOverride(status ? { status, url } : null)}
                          onClose={() => { setAiEditorSlot(null); setAiOverride(null) }}
                          onApply={(newFile) => {
                            if (aiEditorSlot === 0) setFile(newFile)
                            else if (aiEditorSlot === 1) setFileB(newFile)
                            setAiEditorSlot(null)
                            setAiOverride(null)
                          }}
                        />
                      )
                    ) : (
                      <>
                        {/* Versus: puntitos del carrusel — más finos (3px, igual
                            que los puntos del feed en CarouselSlide.jsx), antes 6px. */}
                        {mode === 'versus' && (
                          <div className="flex items-center justify-center gap-1.5">
                            {[0, 1].map((i) => (
                              <button
                                key={i}
                                aria-label={`video ${i === 0 ? 'A' : 'B'}`}
                                onClick={() => setVersusIdx(i)}
                                className={`rounded-full transition-all duration-200 ${versusIdx === i ? 'w-5 h-[3px] bg-white' : 'w-1.5 h-[3px] bg-white/40'}`}
                              />
                            ))}
                          </div>
                        )}
                        {error && <div className="text-xs text-rose-300">{error}</div>}
                        <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3">
                          <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={mode === 'duet' ? 'Who wins? 🥊 #1vs1' : mode === 'challenge' ? 'Challenge 🔥 Do you accept?' : mode === 'solo' ? 'Share something…' : 'Which do you prefer? 🅰️🆚🅱️'}
                            rows={1}
                            className="w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-400 focus:outline-none resize-none"
                          />
                        </div>
                        {/* "Allow challenge" — solo en publicaciones tipo
                            "Your post" (petición del usuario: poder
                            activar/desactivar el botón de retar). Por
                            defecto activado. También editable después de
                            publicada desde el menú "⋮" (ver
                            OpenChallengeSlide.jsx). */}
                        {mode === 'solo' && (
                          <div className="flex items-center gap-3 rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3">
                            <Swords size={18} className="text-white/80 shrink-0" strokeWidth={1.75} />
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-[14px] font-semibold leading-tight">Allow challenges</p>
                              <p className="text-zinc-400 text-[11.5px] leading-tight">Let others challenge you from this post</p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={allowChallenge}
                              aria-label="Allow challenges"
                              onClick={() => setAllowChallenge((v) => !v)}
                              className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${allowChallenge ? 'bg-emerald-500' : 'bg-white/20'}`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${allowChallenge ? 'translate-x-5' : ''}`}
                              />
                            </button>
                          </div>
                        )}
                        {/* Añadir música (iTunes) */}
                        {music ? (
                          <div className="flex items-center gap-3 rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-3 py-2.5">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                              {music.artwork ? <img src={music.artwork} alt="" className="w-full h-full object-cover" /> : <Music size={18} className="text-zinc-400 m-auto mt-2.5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-white text-[13px] font-semibold truncate">{music.title}</p>
                              <p className="text-zinc-400 text-[11.5px] truncate">{music.artist}</p>
                            </div>
                            <button onClick={() => setMusicOpen(true)} className="text-[12px] font-semibold text-white/80 hover:text-white px-2 shrink-0">Change</button>
                            <button onClick={() => setMusic(null)} aria-label="Remove music" className="text-zinc-400 hover:text-white shrink-0 p-1">
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setMusicOpen(true)}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3 text-[14px] font-semibold text-white hover:bg-black/60 active:scale-[0.99] transition"
                          >
                            <Music size={17} strokeWidth={2} /> Add music
                          </button>
                        )}
                        <button
                          onClick={() => (mode === 'challenge' ? goToTarget() : doUpload())}
                          disabled={publishing || (isAB ? (!file || !fileB) : !file)}
                          className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] disabled:bg-white/20 disabled:text-white/40 active:scale-[0.99] transition flex items-center justify-center gap-2"
                        >
                          {publishing && mode !== 'challenge' ? (
                            <><Loader2 size={17} className="animate-spin" /> Publishing…</>
                          ) : (
                            mode === 'duet' ? 'Publish 1vs1' : mode === 'challenge' ? 'Choose who to challenge' : mode === 'solo' ? 'Publish' : 'Publish versus'
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
      <MusicPicker open={musicOpen} onClose={() => setMusicOpen(false)} onSelect={setMusic} current={music} />
    </div>
  )
}
