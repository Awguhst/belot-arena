import { useEffect, useState, type CSSProperties } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Diamond,
  Ellipsis,
  Expand,
  GraduationCap,
  History,
  Lightbulb,
  Minimize,
  RotateCcw,
  Settings2,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  SUITS,
  RANKS,
  cardObligation,
  cardPoints,
  declarationsCompatible,
  detectDeclarations,
  sameCard,
  teamOf,
  type Bid,
  type Card,
  type GameAction,
  type PlayerView,
} from '@belot/game-engine'
import type { BotDecision } from '@belot/bots'
import { t, suits, declarationName } from './i18n'
import type { Preferences } from './store'
import { CardFace } from './table/CardFace'
import { Auction, ContractPip } from './table/Auction'
import { Station, CapturedPile } from './table/Stations'
import { ResetGameButton } from './table/ResetGameButton'
import { FeltInlay, ClubCrest } from './table/Felt'
import { tableText } from './table/names'
import { usePlayerName, useTableRoom, useTablePrefSetter } from './table/roomContext'
import { AnimationLayer, type TableAnimation } from './table/animation'
import { cardId, timingFor } from './table/animationPlan'
import { RewardPresentation, ScoreHUD, TableAnnouncements, HandResult } from './table/Rewards'
import type { MatchSummary } from './table/rewardModel'
import { TableTools, type ToolPanel } from './table/TableTools'
import { playTableSound, unlockTableAudio } from './table/sound'
import './table/table.css'

export interface TableNavigation {
  home: () => void
  review?: (id: string) => void
  setup?: () => void
  restart?: () => void
}
interface TableProps extends TableNavigation {
  view: PlayerView
  legal: GameAction[]
  prefs: Preferences
  sessionId: string
  canUndo: boolean
  submit: (action: GameAction) => void
  requestHint: () => BotDecision | null
  undo: () => void
  animation: TableAnimation
  matchStats?: MatchSummary
}
const noDeclarations: string[] = []
const renderFlyingCard = (card: Card) => <CardFace card={card} />
export function Table({
  view: v,
  legal,
  prefs,
  sessionId,
  canUndo,
  submit,
  requestHint,
  undo,
  animation,
  matchStats,
  home,
  review,
  setup,
  restart,
}: TableProps) {
  const lang = prefs.lang,
    timing = timingFor(animation.speed)
  const room = useTableRoom()
  const name = usePlayerName(lang)
  const [panel, setPanel] = useState<ToolPanel | null>(null)
  const [hint, setHint] = useState<{ revision: number; value: BotDecision } | null>(null)
  const [selected, setSelected] = useState(noDeclarations)
  const [invalid, setInvalid] = useState<{ id: string; text: string } | null>(null)
  const [full, setFull] = useState(!!document.fullscreenElement)
  const setPref = useTablePrefSetter()
  const bidding = v.phase === 'BIDDING',
    playing = v.phase === 'PLAYING_TRICK'
  const human = (bidding || playing) && v.turn === 'south'
  const finished = v.phase === 'NEXT_HAND' || v.phase === 'MATCH_COMPLETE'
  const expert = prefs.assistanceMode === 'expert'
  const locked = animation.locked || !!room?.blocked
  const dealing = animation.job?.event.kind === 'deal'
  const resolving = v.phase === 'TRICK_RESOLUTION'
  const revealedWinner = resolving && (!locked || animation.stage !== 'play')
  const decision = hint?.revision === v.revision && !expert ? hint.value : null
  const declarationOptions =
    human && playing && !prefs.autoDeclare && v.contract && v.hand.length === 8
      ? detectDeclarations(v.hand, v.contract)
      : []
  const hand = [...v.hand].sort(
    (a, b) =>
      SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank),
  )
  useEffect(() => {
    setInvalid(null)
    setHint(null)
    setSelected(noDeclarations)
  }, [sessionId, v.revision])
  useEffect(() => {
    setPanel(null)
  }, [sessionId])
  useEffect(() => {
    if (invalid) {
      const timer = setTimeout(() => setInvalid(null), 2200)
      return () => clearTimeout(timer)
    }
  }, [invalid])
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      setInvalid({ id: 'fullscreen', text: tableText(lang, 'fullUnavailable') })
    }
  }
  function recommendation() {
    if (expert || room?.hints === false || !human || locked) return
    const value = requestHint()
    if (value) {
      setHint({ revision: v.revision, value })
      setPanel('coach')
    }
  }
  function play(card: Card) {
    if (locked) return
    const action = legal.find((a) => a.type === 'play' && sameCard(card, a.card))
    if (action?.type === 'play') {
      playTableSound('select')
      submit(prefs.autoDeclare ? action : { ...action, declarations: selected })
      return
    }
    const reason =
      human && playing && v.contract ? cardObligation(v.hand, v.trick, v.contract, 'south').reason : null
    setInvalid({
      id: cardId(card),
      text:
        prefs.reasons && !expert
          ? t(lang, reason === 'partner' ? 'partnerRule' : (reason ?? 'ownTurn'))
          : '',
    })
  }
  function bid(b: Bid) {
    if (locked) return
    const action = legal.find((a) => a.type === 'bid' && a.bid === b)
    if (action) {
      submit(action)
      return
    }
    setInvalid({
      id: b,
      text:
        prefs.bidAdvice && !expert
          ? t(
              lang,
              !human
                ? 'ownTurn'
                : b === 'contra'
                  ? 'contraUnavailable'
                  : b === 'recontra'
                    ? 'recontraUnavailable'
                    : 'bidUnavailable',
            )
          : '',
    })
  }
  const phaseText = t(
    lang,
    bidding
      ? 'auction'
      : finished
        ? 'result'
        : v.phase === 'INITIAL_DEAL' || dealing
          ? 'dealing'
          : 'trick',
  )
  const turnText = dealing
    ? t(lang, 'dealing')
    : revealedWinner
      ? name(v.turn) + ' · ' + tableText(lang, teamOf(v.turn) === 'us' ? 'ourTrick' : 'theirTrick')
      : human
        ? t(lang, 'yourTurn')
        : finished
          ? tableText(lang, 'closed')
          : playing || bidding
            ? name(v.turn) + ' · ' + tableText(lang, 'turn')
            : phaseText
  const exitLabel = room ? (lang === 'bg' ? 'Напусни стаята' : 'Leave room') : t(lang, 'lobby')
  const vars = {
    '--hover-ms': timing.hover + 'ms',
    '--turn-ms': timing.turn + 'ms',
    '--settle-ms': timing.settle + 'ms',
  } as CSSProperties
  return (
    <RewardPresentation view={v} speed={animation.speed} sessionId={sessionId}>
      <div
        className="arena"
        data-animation-table
        data-theme="club"
        data-tempo={animation.speed}
        style={vars}
      >
        <header className="arena-mast">
          <button
            className="mast-exit arena-icon"
            onClick={home}
            aria-label={exitLabel}
            title={exitLabel}
          >
            <ArrowLeft />
          </button>
          <i className="mast-divider" />
          <div className="arena-wordmark">
            <img src="/spade.svg" alt="" />
            <span>
              Belot <em>Club</em>
            </span>
          </div>
          <i className="mast-divider brand-split" />
          <h1>{room?.title ?? t(lang, 'classic')}</h1>
          <div className="mast-actions">
            {room?.headerStatus}
            {restart && <ResetGameButton lang={lang} sessionId={sessionId} restart={restart} />}
            {(!room || room.education || room.hints) && (
              <button className="mode-control" onClick={() => setPanel('settings')}>
                <span className="mode-light" />
                {tableText(lang, prefs.assistanceMode)}
                <ChevronDown size={12} />
              </button>
            )}
            <i className="mast-divider" />
            <button
              className="arena-icon audio-toggle"
              aria-label={tableText(lang, prefs.muted ? 'unmute' : 'mute')}
              title={tableText(lang, prefs.muted ? 'unmute' : 'mute')}
              onClick={() => {
                setPref('muted', !prefs.muted)
                if (prefs.muted) unlockTableAudio()
              }}
            >
              {prefs.muted ? <VolumeX /> : <Volume2 />}
            </button>
            {document.fullscreenEnabled && (
              <button
                className="arena-icon"
                aria-label={tableText(lang, full ? 'exitFull' : 'full')}
                title={tableText(lang, full ? 'exitFull' : 'full')}
                onClick={fullscreen}
              >
                {full ? <Minimize /> : <Expand />}
              </button>
            )}
            <button
              className="arena-icon"
              onClick={() => setPanel('settings')}
              title={t(lang, 'settings')}
              aria-label={t(lang, 'settings')}
            >
              <Settings2 />
            </button>
          </div>
        </header>
        <div
          className="arena-surface felt"
          data-phase={v.phase}
          data-turn={v.turn}
          data-interactive={!locked}
          data-bidding={bidding}
          data-revision={v.revision}
        >
          <FeltInlay />
          <div className="table-stamp" aria-hidden="true">
            <ClubCrest />
            <span>Belot Club</span>
            <small>
              <i />
              ♣　♦　♥　♠
              <i />
            </small>
          </div>
          <div className="score-anchor">
            <ScoreHUD
              view={v}
              lang={lang}
              speed={animation.speed}
              onBreakdown={() => setPanel('score')}
            />
          </div>
          <button
            type="button"
            className="contract-instrument"
            onClick={() => setPanel('history')}
            aria-label={t(lang, 'playHistory')}
          >
            <span className="contract-label">{t(lang, 'contract')}</span>
            <span className="contract-value">
              {v.contract ? <ContractPip bid={v.contract} /> : <Diamond />}
              <strong>{t(lang, v.contract ?? 'auction')}</strong>
              {v.multiplier > 1 && (
                <em title={t(lang, v.multiplier === 2 ? 'contra' : 'recontra')}>×{v.multiplier}</em>
              )}
            </span>
            <small>
              {t(lang, 'hand')} <b>{String(v.handNumber).padStart(2, '0')}</b>
              <i /> {t(lang, 'trick')}{' '}
              <b>
                {bidding ? '—' : Math.min(8, v.tricks.length + 1)}
                <span>/8</span>
              </b>
            </small>
          </button>
          {(['north', 'west', 'east'] as const).map((seat) => (
            <Station
              key={seat}
              seat={seat}
              view={v}
              lang={lang}
              timing={timing}
              revealedWinner={revealedWinner}
              inspect={() => setPanel('history')}
            />
          ))}
          <div
            data-anim-deck=""
            className={
              'dealing-deck dealer-' +
              v.dealer +
              (bidding || dealing || v.phase === 'FINAL_DEAL' || v.phase === 'INITIAL_DEAL'
                ? ''
                : ' stowed')
            }
            aria-hidden="true"
          >
            <i className="back-print">
              <span>♠</span>
            </i>
          </div>
          <div className="arena-trick" aria-label={t(lang, 'trick')}>
            {v.trick.map((p) => (
              <div
                key={cardId(p.card)}
                data-anim-trick={p.seat}
                className={
                  'trick-card played-' +
                  p.seat +
                  (revealedWinner && p.seat === v.turn ? ' winning-card' : '')
                }
                aria-label={
                  (room ? name(p.seat) : t(lang, p.seat)) +
                  ' ' +
                  p.card.rank +
                  ' ' +
                  t(lang, p.card.suit)
                }
              >
                <CardFace card={p.card} />
              </div>
            ))}
          </div>
          <TableAnnouncements view={v} lang={lang} speed={animation.speed} />
          {bidding && <Auction view={v} lang={lang} legal={legal} locked={locked} onBid={bid} />}
          <div className="south-zone">
            <div role="status" className={'turn-token' + (human && !locked ? ' is-yours' : '')}>
              <i />
              {turnText}
            </div>
            <div data-anim-hand="south" className="hand-cards" aria-label={t(lang, 'yourCards')}>
              {hand.map((card, i) => {
                const offset = i - (hand.length - 1) / 2,
                  allowed = legal.some((a) => a.type === 'play' && sameCard(a.card, card))
                return (
                  <button
                    key={cardId(card)}
                    data-anim-card={cardId(card)}
                    data-legal={!locked && allowed}
                    aria-disabled={locked || !allowed}
                    aria-label={card.rank + ' ' + t(lang, card.suit)}
                    type="button"
                    onClick={() => play(card)}
                    className={
                      'hand-card' +
                      (playing && human && prefs.highlights && !expert
                        ? allowed
                          ? ' eligible'
                          : ' unavailable'
                        : '') +
                      (invalid?.id === cardId(card) ? ' bumped' : '') +
                      (decision?.action.type === 'play' && sameCard(decision.action.card, card)
                        ? ' suggested'
                        : '')
                    }
                    style={
                      {
                        '--offset': offset,
                        '--fan-rotate': offset * 2.7 + 'deg',
                        '--fan-depth': offset * offset,
                        '--order': i + 1,
                      } as CSSProperties
                    }
                  >
                    <CardFace
                      card={card}
                      points={
                        prefs.points && !expert && v.contract ? cardPoints(card, v.contract) : undefined
                      }
                    />
                  </button>
                )
              })}
            </div>
          </div>
          {declarationOptions.length > 0 && (
            <fieldset className="manual-announcements declaration-picker">
              <legend>{t(lang, 'declares')}</legend>
              {declarationOptions
                .filter((d) => !d.requiresCarre || selected.includes(d.requiresCarre))
                .map((d) => (
                  <label key={d.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(d.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...selected, d.id]
                          : declarationOptions
                              .filter(
                                (x) =>
                                  selected.includes(x.id) && x.id !== d.id && x.requiresCarre !== d.id,
                              )
                              .map((x) => x.id)
                        if (declarationsCompatible(declarationOptions.filter((x) => ids.includes(x.id))))
                          setSelected(ids)
                        else setInvalid({ id: d.id, text: t(lang, 'overlapping') })
                      }}
                    />
                    {declarationName(lang, d)} · {d.cards[0].rank}
                    {suits[d.cards[0].suit]} · {d.points}
                  </label>
                ))}
            </fieldset>
          )}
          {invalid?.text && (
            <div className="interaction-toast" role="status">
              {invalid.text}
            </div>
          )}
          <div className="south-pile">
            <CapturedPile view={v} seat="south" lang={lang} inspect={() => setPanel('history')} />
          </div>
          {locked && animation.speed === 'cinematic' && (
            <button
              className="stage-skip"
              onClick={animation.skip}
              title={tableText(lang, 'switchMotion')}
              aria-label={tableText(lang, 'switchMotion')}
            >
              <SkipForward size={16} />
            </button>
          )}
        </div>
        <footer className="arena-dock">
          <div className="dock-side dock-left">
            <button onClick={() => setPanel('history')} aria-label={t(lang, 'playHistory')}>
              <History />
              <span>{t(lang, 'playHistory')}</span>
            </button>
            {prefs.undo && (
              <button onClick={undo} disabled={!canUndo} aria-label={t(lang, 'undo')}>
                <RotateCcw />
                <span>{t(lang, 'undo')}</span>
              </button>
            )}
          </div>
          <Station
            seat="south"
            view={v}
            lang={lang}
            timing={timing}
            revealedWinner={revealedWinner}
            inspect={() => setPanel('history')}
          />
          <div className="dock-side dock-right">
            {!expert && room?.hints !== false && (
              <>
                <button
                  className="coach-toggle"
                  onClick={() => setPanel('coach')}
                  aria-label={t(lang, 'coach')}
                >
                  <GraduationCap />
                  <span>{tableText(lang, 'coach')}</span>
                </button>
                <button
                  className="hint-trigger"
                  disabled={!human || locked}
                  onClick={recommendation}
                  aria-label={t(lang, 'hint')}
                >
                  <Lightbulb />
                  <span>{t(lang, 'hint')}</span>
                </button>
              </>
            )}
            <button
              onClick={() => setPanel('menu')}
              aria-label={tableText(lang, 'tableMenu')}
              title={tableText(lang, 'tableMenu')}
            >
              <Ellipsis />
            </button>
          </div>
        </footer>
        <AnimationLayer animation={animation} renderCard={renderFlyingCard} />
        {finished && (
          <HandResult
            view={v}
            lang={lang}
            speed={animation.speed}
            matchStats={matchStats}
            onNext={() => submit({ type: 'advance', revision: v.revision })}
            onReview={review && (() => review(sessionId + '/' + v.handNumber))}
            onAgain={restart}
            onLobby={home}
          />
        )}
        <TableTools
          view={v}
          prefs={prefs}
          legal={locked ? [] : legal}
          fresh={dealing && v.revision === 0}
          sessionId={sessionId}
          decision={decision}
          requestHint={recommendation}
          canUndo={canUndo}
          undo={undo}
          panel={panel}
          onPanel={setPanel}
          close={() => setPanel(null)}
          onNewGame={setup}
        />
      </div>
    </RewardPresentation>
  )
}
