// VideoPlayerPool: three-player carousel with swapSource() architecture.
// 3 <video> HTMLElements are created once and reused for the whole session.
// Pool exposes acquire(slideId, mp4Url) -> player; release(slideId); preload(slideId, mp4Url).
// Lazy-release: a released player keeps its last src in case of scroll-back.

const LAZY_RELEASE_MS = 30_000

function createPlayerElement() {
  const v = document.createElement('video')
  v.playsInline = true
  v.setAttribute('playsinline', 'true')
  v.setAttribute('webkit-playsinline', 'true')
  v.loop = true
  v.preload = 'auto'
  v.muted = true
  v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;'
  // dual <source> for H.264 mp4 + VP9 webm
  const s1 = document.createElement('source')
  s1.type = 'video/mp4'
  const s2 = document.createElement('source')
  s2.type = 'video/webm'
  v.appendChild(s1)
  v.appendChild(s2)
  return { video: v, mp4Source: s1, webmSource: s2 }
}

class VideoPool {
  constructor(size = 3) {
    this.players = []
    for (let i = 0; i < size; i++) {
      const { video, mp4Source, webmSource } = createPlayerElement()
      this.players.push({
        id: i,
        video,
        mp4Source,
        webmSource,
        slideId: null,
        src: '',
        state: 'IDLE',
        lastUsedAt: 0,
        evictTimer: null,
      })
    }
  }

  /** Pick a player to (re)assign to slideId. Reuses if same slide, else IDLE, else LRU among non-mounted. */
  _pick(slideId) {
    // 1) Already assigned to this slide
    let p = this.players.find((p) => p.slideId === slideId)
    if (p) return p
    // 2) IDLE state (released, even if slideId still set from lazy-release)
    p = this.players.find((p) => p.state === 'IDLE')
    if (p) return p
    // 3) LRU among players NOT currently mounted somewhere (avoid stealing a visible video)
    const unmounted = this.players.filter((p) => !p.video.parentNode)
    if (unmounted.length > 0) {
      return unmounted.slice().sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0]
    }
    // 4) Last resort: LRU overall
    return this.players.slice().sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0]
  }

  /** Swap source bytes without destroying the <video> element. */
  _swapSource(player, mp4Url) {
    if (player.src === mp4Url) return
    // Pause first to free decoder
    try { player.video.pause() } catch (e) {}
    player.mp4Source.src = mp4Url
    player.webmSource.src = mp4Url.replace(/\.mp4$/, '.webm')
    player.src = mp4Url
    // load() forces the element to (re)read its <source> children
    try { player.video.load() } catch (e) {}
  }

  /** Get a player ready to display `mp4Url` for `slideId`. */
  acquire(slideId, mp4Url) {
    const player = this._pick(slideId)
    if (player.evictTimer) {
      clearTimeout(player.evictTimer)
      player.evictTimer = null
    }
    // If we're stealing a player that belonged to another slide, clear that.
    if (player.slideId && player.slideId !== slideId) {
      player.slideId = null
    }
    this._swapSource(player, mp4Url)
    player.slideId = slideId
    player.state = 'READY'
    player.lastUsedAt = Date.now()
    return player
  }

  /** Mark a slide as no longer needing its player; lazy-release so scroll-back is free. */
  release(slideId) {
    const p = this.players.find((p) => p.slideId === slideId)
    if (!p) return
    try { p.video.pause() } catch (e) {}
    p.state = 'IDLE'
    p.lastUsedAt = Date.now()
    // Lazy: keep src bytes warm for a while in case the user scrolls back.
    if (p.evictTimer) clearTimeout(p.evictTimer)
    p.evictTimer = setTimeout(() => {
      if (p.state === 'IDLE') {
        p.slideId = null
      }
    }, LAZY_RELEASE_MS)
  }

  idleCount() {
    return this.players.filter((p) => p.state === 'IDLE').length
  }

  getStats() {
    return this.players.map((p) => ({
      id: p.id,
      state: p.state,
      slideId: p.slideId,
      src: p.src ? p.src.split('/').pop() : '',
    }))
  }
}

let _pool = null

/** Singleton accessor; SSR-safe.
 *  Pool size = 5: holds the active slide (up to 2 players for a duet) plus
 *  one prev + one next neighbor, with margin for fast scroll-back. */
export function getVideoPool() {
  if (typeof window === 'undefined') return null
  if (!_pool) {
    _pool = new VideoPool(5)
    // expose for debugging
    window.__videoPool = _pool
  }
  return _pool
}
