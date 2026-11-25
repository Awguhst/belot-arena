import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChartNoAxesColumn,
  ChevronRight,
  Clock3,
  Layers,
  Lightbulb,
  ListOrdered,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import {
  RANKS,
  SUITS,
  cardObligation,
  cardPoints,
  cardStrength,
  determineTrickWinner,
  sameCard,
  teamOf,
  type Card,
  type GameAction,
  type PlayerView,
} from '@belot/game-engine'
import { chooseHeuristic, explainDecision, type BotDecision } from '@belot/bots'
import { declarationName, suits, t } from '../i18n'
import type { Lang, Preferences } from '../store'
import { ScoreBreakdown } from './Rewards'
import { usePlayerName, useTableRoom } from './roomContext'
import { LivePreferences } from './TablePreferences'
import { toolsWord as w } from './toolWords'
import { useTableSound } from './sound'
import './tools.css'

export type ToolPanel =
  'menu' | 'coach' | 'rules' | 'rankings' | 'tracker' | 'history' | 'score' | 'settings'
const icons = {
  menu: Layers,
  coach: Sparkles,
  rules: BookOpen,
  rankings: ListOrdered,
  tracker: Layers,
  history: Clock3,
  score: ChartNoAxesColumn,
  settings: Settings2,
}
interface Props {
  panel: ToolPanel | null
  close: () => void
  onPanel?: (panel: ToolPanel) => void
  view: PlayerView
  prefs: Preferences
  legal: GameAction[]
  decision: BotDecision | null
  requestHint: () => void
  canUndo: boolean
  undo: () => void
  sessionId?: string
  fresh?: boolean
  onNewGame?: () => void
}
function Chips({ cards, lang }: { cards: Card[]; lang: Lang }) {
  return (
    <span className="tt-cards">
      {cards.map((c) => (
        <span
          className={'tt-chip tt-' + c.suit}
          key={c.suit + c.rank}
          aria-label={c.rank + ' ' + t(lang, c.suit)}
        >
          {c.rank}
          {suits[c.suit]}
        </span>
      ))}
    </span>
  )
}
function Rankings({ lang }: { lang: Lang }) {
  return (
    <div className="tt-rankings">
      <p className="tt-muted">{w(lang, 'highestFirst')}</p>
      {(['hearts', 'no-trumps'] as const).map((contract) => {
        const cards = RANKS.map((rank) => ({ rank, suit: 'hearts' as const })).sort(
          (a, b) => cardStrength(b, contract) - cardStrength(a, contract),
        )
        return (
          <section key={contract}>
            <h3>{t(lang, contract === 'hearts' ? 'trumps' : 'plain')}</h3>
            <table>
              <tbody>
                <tr>
                  <th scope="row">{w(lang, 'rank')}</th>
                  {cards.map((c) => (
                    <td key={c.rank}>{c.rank}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{w(lang, 'pointValue')}</th>
                  {cards.map((c) => (
                    <td key={c.rank}>{cardPoints(c, contract)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
function Tracker({ v, lang }: { v: PlayerView; lang: Lang }) {
  const cards = [...v.tricks.flatMap((tr) => tr.plays), ...v.trick].map((p) => p.card)
  return (
    <div className="tt-tracker">
      <div className="tt-total">
        <span>{w(lang, 'spent')}</span>
        <strong>
          {cards.length}
          <small> / 32</small>
        </strong>
      </div>
      {SUITS.map((suit) => (
        <section key={suit}>
          <h3>
            <span className={'tt-' + suit}>{suits[suit]}</span> {t(lang, suit)}
          </h3>
          <div className="tt-tracker-suit">
            {RANKS.map((rank) => {
              const spent = cards.some((c) => sameCard(c, { suit, rank }))
              return (
                <span
                  key={rank}
                  className={spent ? 'spent' : ''}
                  title={w(lang, spent ? 'spent' : 'unseen')}
                  aria-label={rank + ' ' + t(lang, suit) + ' · ' + w(lang, spent ? 'spent' : 'unseen')}
                >
                  {rank}
                  {spent && <i aria-hidden="true">✓</i>}
                </span>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
function History({ v, lang }: { v: PlayerView; lang: Lang }) {
  const name = usePlayerName(lang)
  return (
    <div className="tt-history">
      <section>
        <h3>{t(lang, 'bids')}</h3>
        {v.bids.length ? (
          <ol className="tt-bids">
            {v.bids.map((entry, i) => (
              <li key={i}>
                <span>{i + 1}</span>
                {name(entry.seat)}
                <b>{t(lang, entry.bid)}</b>
              </li>
            ))}
          </ol>
        ) : (
          <p className="tt-muted">{v.contract ? w(lang, 'emptyAuction') : t(lang, 'noActions')}</p>
        )}
      </section>
      {!!(v.declarations.length || v.belots.length) && (
        <section>
          <h3>{w(lang, 'announced')}</h3>
          {v.declarations.map(({ seat, declaration: d }) => (
            <div className="tt-history-row" key={seat + d.id}>
              <span>{name(seat)}</span>
              <b>
                {declarationName(lang, d)} · {d.points}
              </b>
            </div>
          ))}
          {v.belots.map(({ seat, suit }) => (
            <div className="tt-history-row" key={seat + suit}>
              <span>{name(seat)}</span>
              <b>
                {t(lang, 'belots')} {suits[suit]} · 20
              </b>
            </div>
          ))}
          {!!v.declarations.length && (
            <p className="tt-muted">
              {v.tricks.length
                ? w(lang, 'received') +
                  ' · ' +
                  t(lang, 'us') +
                  ' ' +
                  v.declarationPoints.us +
                  ' / ' +
                  t(lang, 'them') +
                  ' ' +
                  v.declarationPoints.them
                : w(lang, 'pending')}
            </p>
          )}
        </section>
      )}
      <section>
        <h3>
          {t(lang, 'trick')} · {v.tricks.length} / 8
        </h3>
        {!!v.trick.length && (
          <div className="tt-trick">
            <small>{w(lang, 'trickOpen')}</small>
            <Chips cards={v.trick.map((p) => p.card)} lang={lang} />
          </div>
        )}
        {v.tricks.length === 0 && !v.trick.length && <p className="tt-muted">{w(lang, 'opening')}</p>}
        {v.tricks.map((tr, i) => (
          <div className="tt-trick" key={i}>
            <div className="tt-trick-title">
              <b>
                {t(lang, 'trick')} {i + 1}
              </b>
              <small>
                {w(lang, 'wonBy')} {name(tr.winner)} · {t(lang, teamOf(tr.winner))}
              </small>
            </div>
            <Chips cards={tr.plays.map((p) => p.card)} lang={lang} />
            {v.contract && (
              <small>
                {w(lang, 'value')} · {tr.plays.reduce((n, p) => n + cardPoints(p.card, v.contract!), 0)}
              </small>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
function Rules({ lang }: { lang: Lang }) {
  return (
    <div className="tt-rules">
      {[
        [w(lang, 'titleDeal'), w(lang, 'dealRule')],
        [t(lang, 'auction'), w(lang, 'auctionRule')],
        [t(lang, 'suitContract'), w(lang, 'suitRule')],
        [t(lang, 'no-trumps'), t(lang, 'noMeaning')],
        [t(lang, 'all-trumps'), t(lang, 'allMeaning')],
        [t(lang, 'contra') + ' / ' + t(lang, 'recontra'), w(lang, 'doubleRule')],
        [t(lang, 'score'), w(lang, 'scoresRule')],
      ].map(([name, text]) => (
        <section key={name}>
          <h3>{name}</h3>
          <p>{text}</p>
        </section>
      ))}
    </div>
  )
}
function actionText(a: GameAction, lang: Lang) {
  return a.type === 'play' ? a.card.rank + suits[a.card.suit] : a.type === 'bid' ? t(lang, a.bid) : ''
}
function Advice({ decision, lang }: { decision: BotDecision; lang: Lang }) {
  return (
    <div className="hint-result tt-recommendation" role="status">
      <small>
        <Lightbulb size={15} />
        {t(lang, decision.mandatory ? 'mandatory' : 'suggestion')}
      </small>
      <strong>{actionText(decision.action, lang)}</strong>
      <p>{explainDecision(decision.reason, lang)}</p>
      {decision.alternative && (
        <p className="tt-muted">
          {t(lang, 'alternatives')} · {actionText(decision.alternative, lang)}
        </p>
      )}
    </div>
  )
}
function Drawer({
  panel,
  lang,
  close,
  back,
  children,
}: {
  panel: ToolPanel
  lang: Lang
  close: () => void
  back: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
    heading.current?.focus({ preventScroll: true })
  }, [panel])
  const Icon = icons[panel]
  return (
    <dialog
      ref={ref}
      className="tt-drawer"
      aria-label={w(lang, panel)}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="tt-shell">
        <div className="tt-handle" />
        <div className="tt-header">
          {panel === 'menu' ? (
            <span className="tt-emblem">
              <Icon size={19} />
            </span>
          ) : (
            <button className="tt-icon" onClick={back} aria-label={w(lang, 'back')}>
              <ArrowLeft size={19} />
            </button>
          )}
          <h2 ref={heading} tabIndex={-1}>
            {w(lang, panel)}
          </h2>
          <button className="tt-icon" aria-label={t(lang, 'close')} onClick={close}>
            <X size={19} />
          </button>
        </div>
        <div className="tt-content" ref={scroller}>
          {children}
        </div>
      </div>
    </dialog>
  )
}
export function TableTools({
  panel,
  close,
  onPanel,
  onNewGame,
  view: v,
  prefs,
  legal,
  decision,
  requestHint,
  canUndo,
  undo,
  sessionId = '',
  fresh = false,
}: Props) {
  const lang = prefs.lang,
    expert = prefs.assistanceMode === 'expert'
  const name = usePlayerName(lang)
  const room = useTableRoom()
  const hints = !expert && room?.hints !== false
  const education = room?.education !== false
  const human = legal.some((a) => a.type !== 'advance' && a.seat === 'south')
  const [dismissed, setDismissed] = useState<number | null>(null)
  useTableSound(v, prefs, sessionId, fresh)
  const assisted =
    hints && human && prefs.assistanceMode === 'learning' && prefs.autoCoach && dismissed !== v.revision
  if (!panel) {
    if (!assisted) return null
    const auto = chooseHeuristic(v, legal, { difficulty: 'intermediate' })
    return (
      <aside className="tt-auto" aria-live="polite">
        <Lightbulb size={15} />
        <button className="tt-auto-detail" onClick={() => onPanel?.('coach')}>
          {t(lang, auto.mandatory ? 'mandatory' : 'suggestion')} · <b>{actionText(auto.action, lang)}</b>
        </button>
        <button
          className="tt-auto-close"
          onClick={() => setDismissed(v.revision)}
          aria-label={t(lang, 'close')}
        >
          <X size={13} />
        </button>
      </aside>
    )
  }
  const go = (p: ToolPanel) => onPanel?.(p)
  const onUndo = () => {
    undo()
    close()
  }
  const menuLink = (key: ToolPanel) => {
    const Icon = icons[key]
    return (
      <button className="tt-menu-link" key={key} onClick={() => go(key)}>
        <Icon size={18} />
        <span>{w(lang, key)}</span>
        <ChevronRight size={15} />
      </button>
    )
  }
  const obligation =
    v.contract && human && v.phase === 'PLAYING_TRICK'
      ? cardObligation(v.hand, v.trick, v.contract, v.seat)
      : null
  const autoAdvice =
    hints &&
    panel === 'coach' &&
    human &&
    prefs.assistanceMode === 'learning' &&
    (prefs.autoCoach || (v.phase === 'BIDDING' && prefs.bidAdvice))
      ? chooseHeuristic(v, legal, { difficulty: 'intermediate' })
      : null
  const recommendation = decision ?? autoAdvice
  return (
    <Drawer panel={panel} lang={lang} close={close} back={() => go('menu')}>
      {panel === 'menu' && (
        <div className="tt-menu">
          {hints && (
            <>
              <button className="tt-menu-link" disabled={!human} onClick={requestHint}>
                <Lightbulb size={18} />
                <span>{t(lang, 'hint')}</span>
                <ChevronRight size={15} />
              </button>
              {menuLink('coach')}
            </>
          )}
          {!room && (
            <button className="tt-menu-link" disabled={!canUndo} onClick={onUndo}>
              <RotateCcw size={18} />
              <span>{t(lang, 'undo')}</span>
              <ChevronRight size={15} />
            </button>
          )}
          {(
            [
              'history',
              'score',
              ...(education ? (['tracker', 'rules'] as const) : []),
              ...(education && !expert ? ['rankings' as const] : []),
              'settings',
            ] as const
          ).map(menuLink)}
          {onNewGame && (
            <button
              className="tt-menu-link"
              onClick={() => {
                close()
                onNewGame()
              }}
            >
              <Plus size={18} />
              <span>{t(lang, 'newGame')}</span>
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}
      {panel === 'settings' && <LivePreferences lang={lang} />}
      {panel === 'history' && <History v={v} lang={lang} />}
      {panel === 'rules' && education && <Rules lang={lang} />}
      {panel === 'rankings' &&
        education &&
        (expert ? <p className="tt-muted">{w(lang, 'expertHelp')}</p> : <Rankings lang={lang} />)}
      {panel === 'tracker' && education && <Tracker v={v} lang={lang} />}
      {panel === 'score' && <ScoreBreakdown view={v} lang={lang} />}
      {panel === 'coach' &&
        room?.hints !== false &&
        (expert ? (
          <p>{w(lang, 'expertHelp')}</p>
        ) : (
          <div className="tt-coach">
            {prefs.reasons && obligation && (
              <p>{t(lang, obligation.reason === 'partner' ? 'partnerRule' : obligation.reason)}</p>
            )}
            {prefs.winning && !!v.trick.length && v.contract && (
              <p>
                {t(lang, 'wins')} · {name(determineTrickWinner(v.trick, v.contract))}
              </p>
            )}
            {v.phase === 'BIDDING' && prefs.bidAdvice && <p>{t(lang, 'bidAdvice')}</p>}
            {recommendation ? (
              <Advice decision={recommendation} lang={lang} />
            ) : (
              <p className="tt-muted">{w(lang, human ? 'coachStart' : 'coachWait')}</p>
            )}
            <div className="tt-actions">
              <button className="btn" onClick={requestHint} disabled={!human}>
                <Lightbulb size={16} />
                {t(lang, 'hint')}
              </button>
              {prefs.undo && (
                <button className="btn secondary" disabled={!canUndo} onClick={onUndo}>
                  <RotateCcw size={16} />
                  {t(lang, 'undo')}
                </button>
              )}
            </div>
            {prefs.rankings && <Rankings lang={lang} />}
            {prefs.tracker && menuLink('tracker')}
          </div>
        ))}
    </Drawer>
  )
}
