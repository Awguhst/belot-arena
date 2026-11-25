import { useEffect, useMemo, useRef } from 'react'
import { chooseHeuristic } from '@belot/bots'
import { getLegalActions, type GameAction } from '@belot/game-engine'
import { chooseAction } from './botWorker'
import { completedHands, type LocalSession } from './session'
import { useClub } from './store'
import { Table, type TableNavigation } from './Table'
import { useTableAnimation } from './table/animation'
import { summarizeMatch } from './table/rewardModel'

export function ConnectedTable({ active, ...navigation }: TableNavigation & { active: LocalSession }) {
  const { prefs, dispatch, hint, undoTurn } = useClub()
  const view = useMemo(() => active.view('south'), [active])
  const legal = useMemo(() => getLegalActions(view, 'south'), [view])
  const { phase, turn, revision } = view
  const humanTurn = legal.length > 0
  const botTurn = (phase === 'BIDDING' || phase === 'PLAYING_TRICK') && !humanTurn
  const bot = useRef<{ started: number; decision: ReturnType<typeof chooseAction> } | null>(null)
  const canUndo = prefs.undo && active.undoIndex >= 0
  const animation = useTableAnimation({
    sessionId: active.record.id,
    view,
    opening: active.openingDeal ? active : null,
    speed: prefs.animationSpeed,
    motion: prefs.motion,
    expert: prefs.assistanceMode === 'expert',
    lang: prefs.lang,
  })
  const { locked, capture } = animation
  const matchStats = useMemo(
    () =>
      phase === 'MATCH_COMPLETE'
        ? summarizeMatch(completedHands(active.record).map((h) => h.final))
        : undefined,
    [phase, active],
  )

  useEffect(() => {
    if (!botTurn) return
    const controller = new AbortController()
    const botView = active.view(turn)
    // Deliberate during the preceding movement. Only the unlocked table can commit the choice.
    bot.current = {
      started: performance.now(),
      decision: chooseAction(
        botView,
        getLegalActions(botView, turn),
        {
          difficulty: active.record.difficulty,
          simulations: 18,
        },
        controller.signal,
      ),
    }
    return () => {
      controller.abort()
      bot.current = null
    }
  }, [active, botTurn, turn])

  useEffect(() => {
    if (phase === 'NEXT_HAND' || phase === 'MATCH_COMPLETE' || humanTurn || locked) return
    let cancelled = false
    const pending = bot.current
    const speed = { slow: 1250, normal: 650, fast: 50 }[prefs.speed]
    const delay = pending ? Math.max(0, speed - (performance.now() - pending.started)) : 0
    const timer = setTimeout(async () => {
      if (cancelled) return
      const action: GameAction | undefined = pending
        ? (await pending.decision)?.action
        : { type: 'advance', revision }
      if (!cancelled && action) {
        capture(action)
        dispatch(action, active)
      }
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, prefs.speed, dispatch, humanTurn, phase, revision, locked, capture])

  function submit(action: GameAction) {
    if (locked || action.revision !== revision) return
    if (action.type === 'advance' ? phase !== 'NEXT_HAND' : action.seat !== 'south' || !humanTurn) return
    capture(action)
    dispatch(action, active)
  }
  function requestHint() {
    if (
      !humanTurn ||
      locked ||
      prefs.assistanceMode === 'expert' ||
      useClub.getState().active !== active
    )
      return null
    const decision = chooseHeuristic(view, legal, { difficulty: 'intermediate' })
    hint()
    return decision
  }
  function undo() {
    if (canUndo && useClub.getState().active === active) {
      animation.skip()
      undoTurn()
    }
  }

  return (
    <Table
      {...navigation}
      view={view}
      legal={legal}
      prefs={prefs}
      sessionId={active.record.id}
      canUndo={canUndo}
      animation={animation}
      matchStats={matchStats}
      submit={submit}
      requestHint={requestHint}
      undo={undo}
    />
  )
}
