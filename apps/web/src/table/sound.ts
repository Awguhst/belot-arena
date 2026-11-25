import { useEffect, useRef } from 'react'
import { teamOf, type PlayerView } from '@belot/game-engine'
import { useClub, type Preferences } from '../store'
import { tableEvent, timingFor, type TableTiming } from './animationPlan'

// All sounds are synthesized locally. Noise supplies paper and felt, soft sine pairs provide the score cues.
export type TableSound =
  | 'shuffle'
  | 'deal'
  | 'select'
  | 'place'
  | 'collect'
  | 'bid'
  | 'points'
  | 'belot'
  | 'contra'
  | 'recontra'
  | 'hand'
  | 'match'
type Scheduled = { cue: TableSound; ms: number }
export function soundSequence(
  previous: PlayerView | null,
  view: PlayerView,
  timing: TableTiming,
  fresh = false,
): Scheduled[] {
  if (previous && view.revision !== previous.revision + 1) return []
  const out: Scheduled[] = []
  const event = tableEvent(previous, view, fresh)
  if (event?.kind === 'deal') {
    if (!event.existing.length) out.push({ cue: 'shuffle', ms: 0 })
    // Mark each packet's arrival. Instant presentation uses a single soft sound.
    if (!timing.stagger) out.push({ cue: 'deal', ms: 0 })
    else
      event.moves.forEach((move, i) => {
        if (i === event.moves.length - 1 || move.seat !== event.moves[i + 1].seat)
          out.push({ cue: 'deal', ms: i * timing.stagger + timing.deal })
      })
  }
  if (event?.kind === 'play') {
    out.push({ cue: 'place', ms: timing.play * 0.83 })
    if (event.collect) {
      const gathered = timing.play + timing.hold + timing.gather
      out.push({ cue: 'collect', ms: gathered })
      if (event.collect.points > 0) out.push({ cue: 'points', ms: gathered + timing.collect })
    }
  }
  if (previous && previous.handNumber === view.handNumber) {
    if (view.bids.length > previous.bids.length) {
      const bid = view.bids.at(-1)!.bid
      out.push({ cue: bid === 'contra' || bid === 'recontra' ? bid : 'bid', ms: 0 })
    }
    if (view.belots.length > previous.belots.length) out.push({ cue: 'belot', ms: timing.play })
    if (view.result && !previous.result) {
      const usWon =
        view.result.outcome !== 'tied' &&
        view.declaringTeam &&
        (view.result.outcome === 'made') === (teamOf(view.seat) === view.declaringTeam)
      if (view.winner === teamOf(view.seat)) out.push({ cue: 'match', ms: 0 })
      else if (usWon) out.push({ cue: 'hand', ms: 0 })
    }
  }
  return out
}

interface AudioRig {
  ctx: AudioContext
  master: GainNode
  effects: GainNode
  noise: AudioBuffer
  room: AudioBufferSourceNode | null
  dry: GainNode | null
}
let rig: AudioRig | null = null
let seated = false
const activeSounds = new Set<AudioScheduledSourceNode>()
function makeRig(ctx: AudioContext): AudioRig {
  const master = ctx.createGain(),
    effects = ctx.createGain()
  master.connect(ctx.destination)
  effects.connect(master)
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
    data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return { ctx, master, effects, noise, room: null, dry: null }
}
function stopSounds() {
  for (const source of activeSounds) {
    try {
      source.stop()
    } catch {
      /* Already ended. */
    }
  }
  activeSounds.clear()
}
function configureAudio(prefs: Preferences) {
  if (!rig) return
  const { ctx, master, effects } = rig
  const audible = seated && !prefs.muted && !document.hidden
  master.gain.setTargetAtTime(audible ? prefs.masterVolume / 100 : 0, ctx.currentTime, 0.012)
  effects.gain.setTargetAtTime(prefs.effectsVolume / 100, ctx.currentTime, 0.012)
  if (!audible) stopSounds()
  if (audible && prefs.ambient && !rig.room) {
    const room = ctx.createBufferSource(),
      air = ctx.createBiquadFilter(),
      dry = ctx.createGain()
    room.buffer = rig.noise
    room.loop = true
    air.type = 'lowpass'
    air.frequency.value = 190
    dry.gain.value = 0
    dry.gain.setTargetAtTime(0.045, ctx.currentTime, 0.35)
    room.connect(air)
    air.connect(dry)
    dry.connect(master)
    room.onended = () => {
      room.disconnect()
      air.disconnect()
      dry.disconnect()
    }
    room.start()
    rig.room = room
    rig.dry = dry
  } else if ((!audible || !prefs.ambient) && rig.room) {
    rig.dry?.gain.setTargetAtTime(0, ctx.currentTime, 0.015)
    rig.room.stop(ctx.currentTime + 0.08)
    rig.room = null
    rig.dry = null
  }
}
/** Invoke only from a trusted pointer or keyboard gesture, including the unmute control. */
export function unlockTableAudio() {
  const prefs = useClub.getState().prefs
  if (prefs.muted || typeof window === 'undefined' || rig?.ctx.state === 'running') return
  try {
    const Api =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Api) return
    if (!rig || rig.ctx.state === 'closed') rig = makeRig(new Api())
    if (rig.ctx.state === 'suspended') void rig.ctx.resume().catch(() => {})
    configureAudio(prefs)
  } catch {
    /* Gameplay is independent of the audio device. */
  }
}
function voice(source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, end: number) {
  activeSounds.add(source)
  source.onended = () => {
    activeSounds.delete(source)
    source.disconnect()
    for (const node of nodes) node.disconnect()
  }
  source.start(start)
  source.stop(end)
}
export function playTableSound(cue: TableSound) {
  if (
    !rig ||
    !seated ||
    document.hidden ||
    useClub.getState().prefs.muted ||
    rig.ctx.state !== 'running'
  )
    return
  const { ctx, noise, effects } = rig,
    now = ctx.currentTime
  function paper(offset: number, duration: number, frequency: number, level: number) {
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      envelope = ctx.createGain(),
      at = now + offset
    source.buffer = noise
    source.playbackRate.value = 0.9 + Math.random() * 0.18
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(frequency, at)
    filter.frequency.exponentialRampToValueAtTime(frequency * 0.42, at + duration)
    filter.Q.value = 0.7
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.009)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(effects)
    voice(source, [filter, envelope], at, at + duration + 0.01)
  }
  function tone(hz: number, offset: number, length: number, level = 0.055) {
    const oscillator = ctx.createOscillator(),
      envelope = ctx.createGain(),
      at = now + offset
    oscillator.type = 'sine'
    oscillator.frequency.value = hz
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(level, at + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length)
    oscillator.connect(envelope)
    envelope.connect(effects)
    voice(oscillator, [envelope], at, at + length + 0.01)
  }
  switch (cue) {
    case 'shuffle':
      for (let i = 0; i < 5; i++) paper(i * 0.027, 0.085, 1200 + i * 250, 0.13)
      break
    case 'deal':
      paper(0, 0.066, 2050, 0.15)
      break
    case 'select':
      paper(0, 0.036, 3100, 0.08)
      break
    case 'place':
      paper(0, 0.085, 1350, 0.23)
      tone(104, 0, 0.075, 0.07)
      break
    case 'collect':
      paper(0, 0.19, 1550, 0.25)
      paper(0.09, 0.12, 850, 0.14)
      break
    case 'bid':
      tone(328, 0, 0.12, 0.055)
      break
    case 'points':
      tone(785, 0, 0.19, 0.038)
      break
    case 'belot':
      tone(659, 0, 0.22)
      tone(880, 0.1, 0.3)
      break
    case 'contra':
      tone(165, 0, 0.19, 0.085)
      tone(247, 0.06, 0.22, 0.07)
      break
    case 'recontra':
      tone(165, 0, 0.19, 0.085)
      tone(247, 0.07, 0.22, 0.07)
      tone(330, 0.14, 0.25)
      break
    case 'hand':
      ;[392, 494, 587].forEach((hz, i) => tone(hz, i * 0.08, 0.35, 0.047))
      break
    case 'match':
      ;[392, 494, 587, 784].forEach((hz, i) => tone(hz, i * 0.12, 0.55, 0.056))
      break
  }
}

export function useTableSound(view: PlayerView, prefs: Preferences, sessionId: string, fresh: boolean) {
  const previous = useRef<{ view: PlayerView; id: string } | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const clear = () => {
    for (const id of timers.current) clearTimeout(id)
    timers.current.clear()
  }
  useEffect(() => {
    seated = true
    // Entering a new table from its Play button can still carry that explicit activation.
    if (navigator.userActivation?.isActive) unlockTableAudio()
    const gesture = (e: Event) => {
      if (e.isTrusted) unlockTableAudio()
    }
    const visibility = () => {
      if (document.hidden) clear()
      configureAudio(useClub.getState().prefs)
    }
    document.addEventListener('pointerdown', gesture, true)
    document.addEventListener('keydown', gesture, true)
    document.addEventListener('visibilitychange', visibility)
    configureAudio(useClub.getState().prefs)
    return () => {
      seated = false
      clear()
      stopSounds()
      document.removeEventListener('pointerdown', gesture, true)
      document.removeEventListener('keydown', gesture, true)
      document.removeEventListener('visibilitychange', visibility)
      if (rig) {
        configureAudio(useClub.getState().prefs)
        const departing = rig
        // A StrictMode effect replay retains the context unlocked by the user's gesture.
        queueMicrotask(() => {
          if (!seated && rig === departing) {
            void departing.ctx.close().catch(() => {})
            rig = null
          }
        })
      }
    }
  }, [])
  useEffect(() => {
    configureAudio(prefs)
    if (prefs.muted) clear()
  }, [prefs])
  useEffect(() => {
    clear()
  }, [prefs.animationSpeed, prefs.motion, prefs.assistanceMode])
  useEffect(() => {
    const last = previous.current
    if (last?.id === sessionId && last.view.revision === view.revision) return
    const prev = last?.id === sessionId ? last.view : null
    if (!prev || view.revision !== prev.revision + 1) {
      clear()
      stopSounds()
    }
    previous.current = { view, id: sessionId }
    if (document.hidden || prefs.muted || !rig) return
    const motion = prefs.motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timing = timingFor(prefs.animationSpeed, motion, prefs.assistanceMode === 'expert')
    for (const { cue, ms } of soundSequence(prev, view, timing, fresh)) {
      if (ms === 0) playTableSound(cue)
      else {
        const timer = setTimeout(() => {
          timers.current.delete(timer)
          playTableSound(cue)
        }, ms)
        timers.current.add(timer)
      }
    }
  }, [view, sessionId, fresh, prefs])
}
