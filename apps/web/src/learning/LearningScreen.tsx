import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleHelp,
  Diamond,
  Layers3,
  Lightbulb,
} from 'lucide-react'
import { nextSeat } from '@belot/game-engine'
import type { Bid, Card, Contract, Seat } from '@belot/game-engine'
import { lessons } from './lessons'
import { puzzles } from './puzzles'
import { solvePuzzle } from './grade'
import { cardFromCode, cardKey, contractName, glyph, seatName } from './model'
import type { Difficulty, Language, Puzzle, StudyState } from './model'
import { categoryNames, difficultyNames, ui } from './labels'
import { recordStudyAnswer } from './progress'
import type { LearningProgress, StudySection } from './progress'
import './learning.css'

export interface LearningScreenProps {
  section: StudySection
  lang: Language
  initialId?: string
  progress: LearningProgress
  onProgressChange: (progress: LearningProgress) => void
}
function bidLabel(bid: Bid, lang: Language): string {
  if (bid === 'pass') return ui.pass[lang]
  if (bid === 'contra') return ui.double[lang]
  if (bid === 'recontra') return ui.redouble[lang]
  return contractName[bid][lang]
}
const cardName = (card: Card, lang: Language) => card.rank + ' ' + contractName[card.suit][lang]
function StudyCard({ card, lang }: { card: Card; lang: Language }) {
  return (
    <span className={'study-card study-card-' + card.suit} role="img" aria-label={cardName(card, lang)}>
      <span className="study-card-corner" aria-hidden="true">
        {card.rank}
        <small>{glyph[card.suit]}</small>
      </span>
      <span className="study-card-pip" aria-hidden="true">
        {glyph[card.suit]}
      </span>
      <span className="study-card-bottom" aria-hidden="true">
        {card.rank}
      </span>
    </span>
  )
}
function Rack({ cards, label, lang }: { cards: Card[]; label: string; lang: Language }) {
  return (
    <div className="study-rack">
      <span className="study-board-label">{label}</span>
      <div className="study-rack-cards">
        {cards.map((card) => (
          <StudyCard key={cardKey(card)} card={card} lang={lang} />
        ))}
      </div>
    </div>
  )
}
function Auction({ state, lang }: { state: Extract<StudyState, { kind: 'auction' }>; lang: Language }) {
  let bidder = state.dealer
  return (
    <>
      <div className="study-board-label">{ui.bidding[lang]}</div>
      {state.bids.length ? (
        <div className="study-auction">
          {state.bids.map((bid, index) => {
            bidder = nextSeat(bidder)
            return (
              <span key={index}>
                {seatName[bidder][lang]} <b>{bidLabel(bid, lang)}</b>
              </span>
            )
          })}
        </div>
      ) : (
        <div className="study-board-heading">{ui.noBids[lang]}</div>
      )}
      <Rack cards={state.hand} label={ui.yourHand[lang]} lang={lang} />
    </>
  )
}
function ContractLabel({ contract, lang }: { contract: Contract; lang: Language }) {
  return (
    <span className="study-contract">
      {contract in glyph && <b aria-hidden="true">{glyph[contract as keyof typeof glyph]}</b>}
      {contractName[contract][lang]}
    </span>
  )
}
function StudyTable({ puzzle, lang }: { puzzle: Puzzle; lang: Language }) {
  const s = puzzle.initialState
  return (
    <div className="study-table" role="group" aria-label={ui.board[lang]}>
      {'contract' in s && (
        <div className="study-table-top">
          <span>{ui.contract[lang]}</span>
          <ContractLabel contract={s.contract} lang={lang} />
        </div>
      )}
      {'trick' in s && (
        <>
          <div className="study-board-label">{ui.currentTrick[lang]}</div>
          <div className="study-played">
            {s.trick.map((move, index) => (
              <div key={move.seat} className="study-played-move">
                <div className="study-play">
                  <StudyCard card={move.card} lang={lang} />
                  <span>{seatName[move.seat][lang]}</span>
                </div>
                {index < s.trick.length - 1 && <ChevronRight size={15} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </>
      )}
      {(s.kind === 'declarations' || (s.kind === 'play' && s.askAboutSet)) && (
        <Rack cards={s.hand} label={ui.yourHand[lang]} lang={lang} />
      )}
      {s.kind === 'auction' && <Auction state={s} lang={lang} />}
      {s.kind === 'count' && (
        <>
          <Rack cards={s.seen} label={ui.seen[lang]} lang={lang} />
          <Rack cards={s.hand} label={ui.yourHand[lang]} lang={lang} />
        </>
      )}
      {s.kind === 'deck' && (
        <>
          <span className="study-board-label">{ui.deck[lang]}</span>
          <div className="study-deck-fan">
            {['Ac', 'Ad', 'Ah', 'As'].map((code) => (
              <StudyCard key={code} card={cardFromCode(code)} lang={lang} />
            ))}
          </div>
        </>
      )}
      {s.kind === 'partner' && (
        <>
          <div className="study-seats" aria-hidden="true">
            {(['north', 'west', 'east', 'south'] as Seat[]).map((seat) => (
              <span key={seat} className={'study-seat study-seat-' + seat}>
                {seatName[seat][lang]}
              </span>
            ))}
            <Diamond size={22} />
          </div>
          <div className="study-board-label">{ui.seating[lang]}</div>
        </>
      )}
      {s.kind === 'score' && (
        <>
          <div className="study-board-label">
            {ui.rawPoints[lang]}
            {s.multiplier > 1 &&
              ' · ' + (s.multiplier === 2 ? ui.double : ui.redouble)[lang] + ' ×' + s.multiplier}
          </div>
          <div className="study-scores">
            {(['us', 'them'] as const).map((team) => (
              <div key={team}>
                <span>{ui[team][lang]}</span>
                <strong>{s.raw[team]}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
function Exercise({
  puzzle,
  lang,
  onAnswer,
  onNext,
  actionLabel,
}: {
  puzzle: Puzzle
  lang: Language
  onAnswer: (correct: boolean) => void
  onNext: () => void
  actionLabel: string
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const group = useId()
  const select = (value: string) => {
    setSelected(value)
    setFeedback(null)
  }
  const check = () => {
    if (!selected || feedback !== null) return
    const correct = solvePuzzle(puzzle).includes(selected)
    setFeedback(correct ? 'correct' : 'wrong')
    onAnswer(correct)
  }
  const cardAnswers = puzzle.choices.every((answer) => answer.card)
  return (
    <div className="study-exercise">
      <StudyTable puzzle={puzzle} lang={lang} />
      <fieldset
        disabled={feedback === 'correct'}
        aria-describedby={group + '-prompt'}
        className="study-answers"
      >
        <legend id={group + '-prompt'}>{puzzle.prompt[lang]}</legend>
        {puzzle.initialState.kind === 'play' && cardAnswers && (
          <span className="study-choice-label">{ui.yourHand[lang]}</span>
        )}
        <div className={cardAnswers ? 'study-options study-card-options' : 'study-options'}>
          {puzzle.choices.map((answer) => (
            <label
              key={answer.id}
              className={'study-option' + (selected === answer.id ? ' study-option-selected' : '')}
            >
              <input
                type="radio"
                name={group}
                value={answer.id}
                checked={selected === answer.id}
                onChange={() => select(answer.id)}
                aria-label={answer.card ? cardName(answer.card, lang) : answer.label?.[lang]}
              />
              {answer.card ? (
                <StudyCard card={answer.card} lang={lang} />
              ) : (
                <>
                  <span className="study-radio-dot" />
                  {answer.label?.[lang]}
                </>
              )}
            </label>
          ))}
        </div>
      </fieldset>
      <div aria-live="polite">
        {feedback && (
          <div className={'study-feedback study-feedback-' + feedback}>
            {feedback === 'correct' ? <CheckCircle2 size={21} /> : <Lightbulb size={21} />}
            <div>
              <strong>{ui[feedback][lang]}</strong>
              <p>{puzzle.explanation[lang]}</p>
            </div>
          </div>
        )}
      </div>
      {feedback === 'correct' ? (
        <button type="button" className="btn study-primary" onClick={onNext}>
          {actionLabel}
          <ArrowRight size={16} />
        </button>
      ) : (
        <button
          type="button"
          className="btn study-primary"
          disabled={!selected || feedback === 'wrong'}
          onClick={check}
        >
          {ui.check[lang]}
          <Check size={16} />
        </button>
      )}
    </div>
  )
}

/** Keyed by route so switching between curriculum and drills starts the appropriate activity. */
export function LearningScreen(props: LearningScreenProps) {
  return <LearningContent key={props.section + '/' + (props.initialId ?? '')} {...props} />
}
function LearningContent({ section, lang, initialId, progress, onProgressChange }: LearningScreenProps) {
  const isLesson = section === 'learn'
  const finished = isLesson ? progress.lessonsCompleted : progress.puzzlesCompleted
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const items = isLesson
    ? lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.topic,
        puzzle: puzzles.find((p) => p.id === lesson.puzzleId)!,
        lesson,
      }))
    : puzzles
        .filter((p) => difficulty === 'all' || difficulty === p.difficulty)
        .map((p) => ({ id: p.id, title: p.title, puzzle: p, lesson: null }))
  const [selectedId, setSelectedId] = useState(
    () => initialId ?? items.find((item) => !finished.includes(item.id))?.id ?? items[0]!.id,
  )
  const current = items.find((item) => item.id === selectedId) ?? items[0]!
  const [attempt, setAttempt] = useState(0)
  const activityHeading = useRef<HTMLHeadingElement>(null)
  const index = items.findIndex((item) => item.id === current.id)
  const total = isLesson ? lessons.length : puzzles.length
  useEffect(() => {
    if (attempt) activityHeading.current?.focus()
  }, [attempt])
  function answer(correct: boolean) {
    const next = recordStudyAnswer(section, current.id, correct)
    onProgressChange(next)
  }
  function goNext() {
    setSelectedId(items[(index + 1) % items.length]!.id)
    setAttempt((value) => value + 1)
  }
  const listLabel = (isLesson ? ui.curriculum : ui.collection)[lang]
  const completedPercent = (100 * finished.length) / total
  const contentId = useId()
  const levelFilter = !isLesson && (
    <label className="study-filter">
      <span>{ui.filter[lang]}</span>
      <select
        aria-label={ui.filter[lang]}
        value={difficulty}
        onChange={(event) => setDifficulty(event.target.value as Difficulty | 'all')}
      >
        <option value="all">{ui.all[lang]}</option>
        {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
          <option value={level} key={level}>
            {difficultyNames[level][lang]}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <section className="study" lang={lang}>
      <header className="study-header page-intro">
        <div>
          <h1 className="page-title">{(isLesson ? ui.academy : ui.puzzles)[lang]}</h1>
          <p>{(isLesson ? ui.academyIntro : ui.puzzleIntro)[lang]}</p>
        </div>
        <div className="study-progress">
          <div>
            <span>{ui.progress[lang]}</span>
            <b>
              {finished.length} / {total}
            </b>
          </div>
          <progress aria-label={ui.progress[lang]} value={completedPercent} max="100" />
        </div>
      </header>
      <div className="study-layout">
        <nav className="study-compact-index" aria-label={listLabel}>
          {levelFilter}
          <label className="study-mobile-picker">
            {(isLesson ? ui.chooseLesson : ui.choosePuzzle)[lang]}
            <select
              aria-label={(isLesson ? ui.chooseLesson : ui.choosePuzzle)[lang]}
              aria-controls={contentId}
              value={current.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {items.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title[lang]}
                </option>
              ))}
            </select>
          </label>
        </nav>
        <article className="study-activity" id={contentId}>
          <div className="study-meta">
            {isLesson ? <BookOpen size={16} /> : <Layers3 size={16} />}
            <span>
              {(isLesson ? ui.lesson : ui.exercise)[lang]}{' '}
              {isLesson
                ? lessons.findIndex((l) => l.id === current.id) + 1
                : puzzles.findIndex((p) => p.id === current.id) + 1}
            </span>
            <i aria-hidden="true" />
            <span>
              {isLesson
                ? categoryNames[current.puzzle.category][lang]
                : difficultyNames[current.puzzle.difficulty][lang]}
            </span>
          </div>
          <h2 ref={activityHeading} tabIndex={-1}>
            {current.title[lang]}
          </h2>
          {current.lesson && <p className="study-intro">{current.lesson.explanation[lang]}</p>}
          {!current.lesson && (
            <p className="study-rule-label">
              <CircleHelp size={14} />
              {(current.puzzle.rule === 'tactical' ? ui.tactical : ui.legal)[lang]}
            </p>
          )}
          <Exercise
            key={current.id + '/' + attempt}
            puzzle={current.puzzle}
            lang={lang}
            onAnswer={answer}
            onNext={goNext}
            actionLabel={
              (index === items.length - 1 ? ui.review : isLesson ? ui.nextLesson : ui.nextPuzzle)[lang]
            }
          />
        </article>
        <nav className="study-index" aria-label={listLabel}>
          <h2>{listLabel}</h2>
          {levelFilter}
          <ol className="study-list">
            {items.map((item, num) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === current.id ? 'step' : undefined}
                  aria-controls={contentId}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className={'study-step' + (finished.includes(item.id) ? ' is-complete' : '')}>
                    {finished.includes(item.id) ? (
                      <Check size={15} aria-label={ui.solved[lang]} />
                    ) : isLesson ? (
                      String(num + 1).padStart(2, '0')
                    ) : (
                      <Circle size={8} />
                    )}
                  </span>
                  <span>{item.title[lang]}</span>
                  {item.id === current.id && <ChevronRight size={15} />}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </section>
  )
}
