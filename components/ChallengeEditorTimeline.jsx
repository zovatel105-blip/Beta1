'use client'

import { useEffect, useRef, useState } from 'react'
import { Layers, Plus, Scale, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import styles from './ChallengeEditor.module.css'

// Local thumbnails only: no uploads, paid APIs or duplicate media requests.
export const ChallengeEditorTimeline = ({ src, duration, currentTime, events, resultConfig, onSeek, onScrubStart, onOpenMoment, onAddMoment, onOpenRules, muted, onToggleMute }) => {
  const scrollRef = useRef(null)
  const syncing = useRef(false)
  const releaseTimer = useRef(null)
  const [width, setWidth] = useState(360)
  const [frames, setFrames] = useState([])
  const [frameError, setFrameError] = useState(false)
  const pixelsPerSecond = width / 14.4
  const trackWidth = Math.max(1, duration) * pixelsPerSecond
  const frameCount = Math.min(12, Math.max(4, Math.ceil(duration / 3)))

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => { observer.disconnect(); clearTimeout(releaseTimer.current) }
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || Math.abs(element.scrollLeft - currentTime * pixelsPerSecond) < 2) return
    syncing.current = true
    element.scrollLeft = currentTime * pixelsPerSecond
    clearTimeout(releaseTimer.current)
    releaseTimer.current = setTimeout(() => { syncing.current = false }, 90)
  }, [currentTime, pixelsPerSecond])

  useEffect(() => {
    setFrames([]); setFrameError(false)
    if (!src || !duration) return
    let cancelled = false
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.preload = 'auto'
    const canvas = document.createElement('canvas')
    canvas.width = 72; canvas.height = 96
    const ctx = canvas.getContext('2d')
    const generated = []
    let index = 0
    const capture = () => {
      if (cancelled || !video.videoWidth || !ctx) return
      try {
        const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
        const w = video.videoWidth * scale, h = video.videoHeight * scale
        ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
        generated.push(canvas.toDataURL('image/jpeg', 0.55))
        setFrames([...generated])
        index += 1
        if (index < frameCount) video.currentTime = Math.min(duration - 0.05, (index * duration) / frameCount)
      } catch { setFrameError(true) }
    }
    video.onloadeddata = () => { if (!index) capture() }
    video.onseeked = capture
    video.onerror = () => { if (!cancelled) setFrameError(true) }
    video.src = src
    return () => { cancelled = true; video.onloadeddata = null; video.onseeked = null; video.onerror = null; video.removeAttribute('src'); video.load() }
  }, [src, duration, frameCount])

  const onScroll = () => {
    if (syncing.current || !duration) return
    onSeek(Math.min(duration, scrollRef.current.scrollLeft / pixelsPerSecond))
  }
  const beginScrub = () => { syncing.current = false; clearTimeout(releaseTimer.current); onScrubStart() }
  const numericCount = events.filter((event) => event.ruleConfig?.predictionType === 'numeric').length

  return (
    <div className={styles.timeline} data-testid="challenge-timeline">
      <div ref={scrollRef} className={styles.timelineScroll} onScroll={onScroll} onPointerDown={beginScrub} onWheel={beginScrub}
        data-testid="timeline-scroll-area" tabIndex={0} role="slider" aria-label="Video position" aria-valuemin={0} aria-valuemax={duration || 0} aria-valuenow={Math.round(currentTime * 10) / 10}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onScrubStart(); onSeek(currentTime + (e.key === 'ArrowRight' ? 1 : -1)) } }}>
        <div className={styles.tracks} style={{ width: trackWidth + width, paddingInline: width / 2 }}>
          <div className={styles.ruler} style={{ width: trackWidth }}>
            {Array.from({ length: Math.ceil((duration || 1) / 5) + 1 }, (_, i) => <span key={i} style={{ left: i * 5 * pixelsPerSecond }} data-testid={`timeline-tick-${i}`}>{i === 0 ? '•' : `${i * 5}s`}</span>)}
          </div>
          <div className={styles.filmstrip} style={{ width: trackWidth }} data-testid="timeline-filmstrip">
            {frames.length > 0 ? Array.from({ length: Math.min(180, Math.max(1, Math.ceil(trackWidth / (width / 12)))) }, (_, i) => <img key={i} alt="" draggable={false} src={frames[Math.min(frames.length - 1, Math.floor(i * frameCount / Math.max(1, Math.ceil(trackWidth / (width / 12)))))]} />) : <span data-testid="timeline-thumbnails-state">{frameError ? 'Video' : 'Loading frames…'}</span>}
          </div>
          <div className={styles.momentTrack} style={{ width: trackWidth }}>
            {events.length === 0 && <Button variant="ghost" onClick={onAddMoment} className={styles.trackAction} data-testid="timeline-add-moment"><Plus />Add moment</Button>}
            {events.map((event, i) => <Button key={event.id} variant="ghost" className={styles.momentBlock} style={{ left: Number(event.startTime) * pixelsPerSecond, width: Math.max(44, (Number(event.endTime) - Number(event.startTime)) * pixelsPerSecond) }}
              onClick={() => onOpenMoment(event.id)} aria-label={`Edit moment ${i + 1}: ${event.question || 'Untitled'}`} data-testid={`timeline-moment-${event.id}`}><Layers /><span>{event.question || (event.ruleConfig?.predictionType === 'numeric' ? 'Guess a number' : `Moment ${i + 1}`)}</span></Button>)}
          </div>
          <div className={styles.rulesTrack} style={{ width: trackWidth }}>
            <Button variant="ghost" onClick={onOpenRules} className={styles.trackAction} data-testid="timeline-rules-result"><Scale />{resultConfig.ruleType === 'highest_score' ? 'Highest score wins' : 'Rules & Result'}{numericCount > 0 && <span className={styles.trackMeta}> · {numericCount} prediction{numericCount > 1 ? 's' : ''}</span>}</Button>
          </div>
        </div>
      </div>
      <div className={styles.playhead} data-testid="timeline-playhead" aria-hidden="true"><span /></div>
      <Button variant="ghost" size="icon" className={styles.trackSound} onClick={onToggleMute} aria-label={muted ? 'Unmute video' : 'Mute video'} data-testid="timeline-sound">{muted ? <VolumeX /> : <Volume2 />}</Button>
      <Button variant="ghost" size="icon" className={styles.trackPlus} onClick={onAddMoment} aria-label="Add moment at playhead" data-testid="timeline-plus"><Plus /></Button>
    </div>
  )
}
