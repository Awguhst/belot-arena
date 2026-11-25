import type { GameAction, PlayerView, Seat } from '@belot/game-engine'
import { cardId, type TableEvent } from './animationPlan'

export interface Anchor {
  x: number
  y: number
  width: number
  height: number
  angle: number
}
export type AnchorMap = Map<string, Anchor & { node: HTMLElement; transform: string }>
export const anchorKey = (kind: string, id = '') => kind + ':' + id

function measure(anchors: AnchorMap, key: string, node: HTMLElement | null, rotated = true) {
  if (!node) return
  const rect = node.getBoundingClientRect()
  let angle = 0
  let transform = 'none'
  if (rotated) {
    const style = getComputedStyle(node)
    transform = style.transform
    if (transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(transform)
      angle = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
    }
    angle += Number.parseFloat(style.rotate) || 0
  }
  anchors.set(key, {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    width: rotated ? node.offsetWidth : rect.width,
    height: rotated ? node.offsetHeight : rect.height,
    angle,
    transform,
    node,
  })
}

function measureSouth(anchors: AnchorMap, root: ParentNode) {
  for (const card of root.querySelectorAll<HTMLElement>('[data-anim-card]'))
    measure(anchors, anchorKey('card', card.dataset.animCard), card)
}

/** Read only the objects that can leave their current positions when this turn advances. */
export function measureSources(root: ParentNode, view: PlayerView, action?: GameAction): AnchorMap {
  const anchors: AnchorMap = new Map()
  if (view.phase === 'FINAL_DEAL' || (view.phase === 'PLAYING_TRICK' && view.turn === 'south')) {
    measureSouth(anchors, root)
    if (action?.type === 'play') {
      const slot = anchors.get(anchorKey('card', cardId(action.card)))
      const face = slot?.node.querySelector<HTMLElement>('.deck-face')
      if (slot && face) {
        // The hit target stays on the felt while its printed face lifts on hover or keyboard focus.
        const rect = face.getBoundingClientRect()
        const style = getComputedStyle(face)
        const matrixScale = style.transform === 'none' ? 1 : new DOMMatrixReadOnly(style.transform).a
        const scale = matrixScale * (Number.parseFloat(style.scale) || 1)
        anchors.set(anchorKey('from', 'south'), {
          ...slot,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: slot.width * scale,
          height: slot.height * scale,
        })
      }
    }
  } else if (view.phase === 'PLAYING_TRICK') {
    const hand = root.querySelector<HTMLElement>('[data-anim-hand="' + view.turn + '"]')
    measure(
      anchors,
      anchorKey('from', view.turn),
      hand?.querySelector<HTMLElement>('[data-anim-back]:last-child') ?? hand,
    )
  } else if (view.phase === 'NEXT_HAND') {
    for (const seat of new Set(view.tricks.map((trick) => trick.winner)))
      measure(
        anchors,
        anchorKey('pile', seat),
        root.querySelector('[data-anim-pile="' + seat + '"]'),
        false,
      )
  }
  return anchors
}

/** Destination nodes are also retained for masks so the animation phase only writes to the DOM. */
export function measureDestinations(root: ParentNode, event: TableEvent): AnchorMap {
  const anchors: AnchorMap = new Map()
  if (event.kind === 'clear' || event.kind === 'deal')
    measure(anchors, anchorKey('deck'), root.querySelector('[data-anim-deck]'))
  if (event.kind === 'deal') {
    measureSouth(anchors, root)
    for (const hand of root.querySelectorAll<HTMLElement>(
      '[data-anim-hand]:not([data-anim-hand="south"])',
    )) {
      const backs = hand.querySelectorAll<HTMLElement>('[data-anim-back]')
      for (let i = event.existing.length; i < backs.length; i++)
        measure(anchors, anchorKey('back', hand.dataset.animHand + String(i)), backs[i])
    }
  } else if (event.kind === 'play') {
    if (event.played.seat === 'south') measureSouth(anchors, root)
    for (const play of event.collect?.plays ?? [event.played])
      measure(
        anchors,
        anchorKey('trick', play.seat),
        root.querySelector('[data-anim-trick="' + play.seat + '"]'),
      )
    if (event.collect) {
      const { winner, team } = event.collect
      measure(
        anchors,
        anchorKey('pile', winner),
        root.querySelector('[data-anim-pile="' + winner + '"]'),
        false,
      )
      measure(
        anchors,
        anchorKey('points', team),
        root.querySelector('[data-points-target="' + team + '"]'),
        false,
      )
    }
  }
  return anchors
}

export function pileAnchor(map: AnchorMap, seat: Seat): Anchor | undefined {
  const pile = map.get(anchorKey('pile', seat))
  if (!pile) return undefined
  const w = Math.min(38, pile.width, pile.height * 0.72)
  return { ...pile, width: w, height: w * 1.38 }
}
