import type { AnimationJob } from './animation'
import { anchorKey, measureDestinations, pileAnchor, type Anchor } from './animationGeometry'
import { cardId, durationOf } from './animationPlan'

type Stop = { at: number; box: Anchor; opacity?: number; easing?: string }
const arc = 'cubic-bezier(.22,.72,.24,1)'
const land = 'cubic-bezier(.18,.67,.27,1)'
function interpolate(from: Anchor, to: Anchor, fraction: number): Anchor {
  const mix = (a: number, b: number) => a + (b - a) * fraction
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: mix(from.width, to.width),
    height: mix(from.height, to.height),
    angle: mix(from.angle, to.angle),
  }
}
function raised(box: Anchor, pixels: number, scale = 1): Anchor {
  return { ...box, y: box.y - pixels, width: box.width * scale, height: box.height * scale }
}

/** One velocity curve spans the whole throw, including the highest part of the arc. */
function travel(start: number, end: number, from: Anchor, to: Anchor, lift: number, tilt = 0): Stop[] {
  const stops: Stop[] = []
  for (let i = 0; i <= 8; i++) {
    const time = i / 8
    const progress = 1 - (1 - time) ** 1.7
    const height = 4 * progress * (1 - progress)
    const box = raised(interpolate(from, to, progress), lift * height, 1 + 0.055 * height)
    box.angle += tilt * height
    stops.push({ at: start + (end - start) * time, box, easing: 'linear' })
  }
  return stops
}

/** Measure each seat once per event. The browser compositor runs the entire flight from these keyframes. */
export function animateTable(layer: HTMLElement, job: AnimationJob): () => void {
  const root = layer.closest('[data-animation-table]') ?? document
  const find = (selector: string) => root.querySelector<HTMLElement>(selector)
  const ghost = (id: string) => layer.querySelector<HTMLElement>('[data-flight="' + id + '"]')
  const animations: Animation[] = []
  const { event, timing: t, before } = job
  const total = durationOf(event, t)
  // For a reflowing hand, sample the final fan slots before starting compositor animations.
  const fanChanges = event.kind === 'deal' || (event.kind === 'play' && event.played.seat === 'south')
  if (fanChanges && root instanceof Element) root.classList.add('flight-measure')
  const geometry = measureDestinations(root, event)
  const origin = layer.getBoundingClientRect()
  if (fanChanges && root instanceof Element) root.classList.remove('flight-measure')
  function animate(node: Element | null | undefined, frames: Keyframe[], duration: number, delay = 0) {
    if (!node || !duration || typeof node.animate !== 'function') return
    const retainStack =
      event.kind === 'play' &&
      event.collect &&
      node.matches('[data-flight], .flight-flipper, [data-anim-trick]')
    animations.push(
      node.animate(frames, {
        duration,
        delay,
        fill: retainStack ? 'forwards' : 'none',
        easing: 'linear',
      }),
    )
  }
  function hide(node: Element | null | undefined, until: number) {
    animate(node, [{ opacity: 0 }, { opacity: 0 }], until)
  }
  function move(node: HTMLElement | null, stops: Stop[], delay = 0) {
    if (!node || stops.length < 2) return
    const size = stops.reduce((a, b) => (a.box.width > b.box.width ? a : b)).box
    const duration = stops.at(-1)!.at
    if (!duration || !size.width || !size.height) return
    node.style.width = size.width + 'px'
    node.style.height = size.height + 'px'
    node.style.fontSize = Math.max(12, size.width * 0.32) + 'px'
    animate(
      node,
      stops.map((s) => {
        const b = s.box
        const x = b.x - origin.left - size.width / 2,
          y = b.y - origin.top - size.height / 2
        return {
          offset: s.at / duration,
          opacity: s.opacity ?? 1,
          transform:
            'translate3d(' +
            x +
            'px,' +
            y +
            'px,0) rotate(' +
            b.angle +
            'deg) scale(' +
            b.width / size.width +
            ',' +
            b.height / size.height +
            ')',
          easing: s.easing ?? arc,
        }
      }),
      duration,
      delay,
    )
  }
  function flip(node: HTMLElement | null, turns: [number, number][], duration: number, delay = 0) {
    animate(
      node?.querySelector('.flight-flipper'),
      turns.map(([time, degrees]) => ({
        offset: time / duration,
        transform: 'perspective(650px) rotateY(' + degrees + 'deg)',
      })),
      duration,
      delay,
    )
  }
  const cleanup = () => {
    for (const animation of animations) animation.cancel()
  }
  if (event.kind === 'contract') {
    const badge = find('.contract-instrument')
    animate(
      badge,
      [{ scale: '1' }, { scale: '1.08', offset: 0.45, color: '#f9df9f' }, { scale: '1' }],
      t.contract,
    )
    return cleanup
  }
  const deck = geometry.get(anchorKey('deck'))
  if (event.kind === 'clear') {
    if (deck)
      event.seats.forEach((seat, i) => {
        const node = ghost('clear-' + seat)
        const start = pileAnchor(before, seat)
        if (!start) return
        const delay = t.clear * 0.07 * i
        const stops = travel(0, t.clear - delay, start, deck, 14)
        stops[stops.length - 1].opacity = 0
        move(node, stops, delay)
      })
    return cleanup
  }
  if (event.kind === 'deal') {
    if (!deck) return cleanup
    const southMoves = event.moves.flatMap((move) => (move.card ? [move.card] : []))
    const dealt = [...event.existing, ...southMoves]
    const places = dealt
      .map((c) => geometry.get(anchorKey('card', cardId(c))))
      .filter((slot) => slot !== undefined)
      .sort((a, b) => a.x - b.x)
    const oldOrder = event.existing
      .map((c) => ({ card: c, source: before.get(anchorKey('card', cardId(c))) }))
      .sort((a, b) => (a.source?.x ?? 0) - (b.source?.x ?? 0))
    const arrivalOrder = [...oldOrder.map((o) => o.card), ...southMoves]
    const provisional = new Map(arrivalOrder.map((c, i) => [cardId(c), places[i]]))
    const sortStart = total - t.settle
    for (const [i, moveInfo] of event.moves.entries()) {
      const { seat, slot, card } = moveInfo
      const id = card ? cardId(card) : null
      const final = geometry.get(id ? anchorKey('card', id) : anchorKey('back', seat + slot))
      if (!final) continue
      const node = ghost('deal-' + i)
      const landing = (id && provisional.get(id)) || final
      const delay = i * t.stagger
      const held = !!id
      const duration = held ? total - delay : t.deal
      hide(final.node, held ? total : delay + t.deal)
      const lift = Math.min(32, Math.abs(deck.x - landing.x) * 0.04 + 8)
      const stops = travel(0, t.deal, deck, landing, lift, ((i % 3) - 1) * 9)
      if (held)
        stops.push(
          { at: Math.max(t.deal, sortStart - delay), box: landing },
          { at: duration, box: final },
        )
      move(node, stops, delay)
      if (held)
        flip(
          node,
          [
            [0, 180],
            [t.deal * 0.38, 180],
            [t.deal, 0],
            [duration, 0],
          ],
          duration,
          delay,
        )
    }
    for (const { card, source } of oldOrder) {
      const id = cardId(card),
        final = geometry.get(anchorKey('card', id))
      const holding = provisional.get(id)
      if (!final || !holding) continue
      hide(final.node, total)
      move(ghost('keep-' + id), [
        { at: 0, box: source ?? holding },
        { at: t.settle, box: holding },
        { at: sortStart, box: holding },
        { at: total, box: final },
      ])
    }
    return cleanup
  }
  const { played, collect } = event
  const winner = collect ? geometry.get(anchorKey('trick', collect.winner)) : null
  const pile = collect ? pileAnchor(geometry, collect.winner) : null
  const gatherAt = t.play + t.hold,
    flyAt = gatherAt + t.gather,
    arriveAt = flyAt + t.collect
  for (const [i, p] of (collect?.plays ?? [played]).entries()) {
    const node = ghost('play-' + p.seat),
      target = geometry.get(anchorKey('trick', p.seat))
    if (!node || !target) continue
    const newest = p.seat === played.seat
    const from = newest
      ? (before.get(anchorKey('from', p.seat)) ??
        before.get(anchorKey('card', cardId(p.card))) ??
        target)
      : target
    hide(target.node, total)
    const stops: Stop[] = newest
      ? travel(
          0,
          t.play * 0.88,
          from,
          raised(target, 2, 1.025),
          Math.min(45, Math.abs(from.y - target.y) * 0.15 + 12),
          p.seat === 'east' ? 9 : -7,
        )
      : [{ at: 0, box: from }]
    stops.push({ at: t.play, box: target })
    if (collect && winner && pile) {
      const won = p.seat === collect.winner
      const lifted = won ? raised(target, 8, 1.07) : target
      const stack = {
        ...winner,
        x: winner.x + i * 1.3,
        y: winner.y - i * 1.4,
        angle: winner.angle + (won ? 0 : (i - 1) * 2),
      }
      stops.push(
        { at: t.play + t.hold * 0.28, box: lifted },
        { at: gatherAt, box: lifted },
        ...travel(flyAt, arriveAt, stack, pile, 17),
        { at: total, box: pile },
      )
      if (won) {
        node.style.zIndex = '6'
        animate(
          node.querySelector('.flight-outline'),
          [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }],
          t.hold + t.gather,
          t.play,
        )
      }
    }
    move(node, stops)
    const duration = stops.at(-1)!.at
    const turns: [number, number][] =
      newest && p.seat !== 'south'
        ? [
            [0, 180],
            [t.play * 0.23, 180],
            [t.play * 0.83, 0],
          ]
        : [[0, 0]]
    if (collect && pile && winner)
      turns.push([flyAt, 0], [flyAt + t.collect * 0.84, 180], [duration, 180])
    else turns.push([duration, 0])
    if (collect || (newest && p.seat !== 'south')) flip(node, turns, duration)
  }
  if (played.seat === 'south') {
    for (const [key, end] of geometry) {
      const start = before.get(key)
      if (!key.startsWith('card:') || !start) continue
      animate(
        end.node,
        [{ transform: start.transform, easing: land }, { transform: end.transform }],
        t.settle,
      )
    }
  }
  if (collect && pile) {
    const recipient = find('[data-anim-seat="' + collect.winner + '"]')
    animate(
      recipient,
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.4)', offset: 0.45 },
        { filter: 'brightness(1)' },
      ],
      t.hold,
      t.play,
    )
    animate(
      recipient,
      [{ scale: '1' }, { scale: '1.07', offset: 0.42 }, { scale: '1' }],
      t.settle,
      arriveAt,
    )
    const chip = layer.querySelector<HTMLElement>('[data-flight-points]')
    const target = geometry.get(anchorKey('points', collect.team))
    if (chip && target) {
      const spot = (x: number, y: number, s: number) =>
        'translate3d(' +
        (x - origin.left) +
        'px,' +
        (y - origin.top) +
        'px,0) translate(-50%,-50%) scale(' +
        s +
        ')'
      const delay = total - t.points
      animate(
        chip,
        [
          { opacity: 0, transform: spot(pile.x, pile.y, 0.65) },
          { offset: 0.2, opacity: 1, transform: spot(pile.x, pile.y - 22, 1.1) },
          { offset: 0.52, opacity: 1, transform: spot(pile.x, pile.y - 30, 1), easing: arc },
          { offset: 1, opacity: 0, transform: spot(target.x, target.y, 0.62) },
        ],
        t.points,
        delay,
      )
    }
  }
  return cleanup
}
