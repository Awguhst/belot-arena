import { lessons } from './lessons'
import { puzzles } from './puzzles'
import { RULESET } from '@belot/game-engine'

export const learningStorageKey = 'belot.learning'
export interface LearningProgress {
  version: 2
  ruleset: typeof RULESET
  lessonsCompleted: string[]
  puzzlesCompleted: string[]
  puzzleAttempts: number
  puzzleCorrect: number
  activity: { date: string; lessons: number; solved: number; attempts: number }[]
}
export function emptyLearningProgress(): LearningProgress {
  return {
    version: 2,
    ruleset: RULESET,
    lessonsCompleted: [],
    puzzlesCompleted: [],
    puzzleAttempts: 0,
    puzzleCorrect: 0,
    activity: [],
  }
}
type OldProgress = Partial<
  Record<keyof LearningProgress | 'lessons' | 'puzzles' | 'attempts' | 'correct', unknown>
>
function count(n: unknown): number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0
}
function ids(value: unknown, known: { id: string }[]): string[] {
  return Array.isArray(value) ? known.map((item) => item.id).filter((id) => value.includes(id)) : []
}
export function decodeLearningProgress(json: string | null): LearningProgress {
  if (!json) return emptyLearningProgress()
  try {
    const data: OldProgress = JSON.parse(json)
    if (!data || (data.version !== 2 && data.version !== 1)) return emptyLearningProgress()
    if (data.ruleset !== undefined && data.ruleset !== RULESET) return emptyLearningProgress()
    const puzzleAttempts = count(data.puzzleAttempts ?? data.attempts)
    const activity: LearningProgress['activity'] = []
    if (Array.isArray(data.activity)) {
      for (const day of data.activity) {
        if (day && typeof day.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
          activity.push({
            date: day.date,
            lessons: count(day.lessons),
            solved: count(day.solved),
            attempts: count(day.attempts),
          })
        }
      }
    }
    return {
      version: 2,
      ruleset: RULESET,
      lessonsCompleted: ids(data.lessonsCompleted ?? data.lessons, lessons),
      puzzlesCompleted: ids(data.puzzlesCompleted ?? data.puzzles, puzzles),
      puzzleAttempts,
      puzzleCorrect: Math.min(puzzleAttempts, count(data.puzzleCorrect ?? data.correct)),
      activity,
    }
  } catch {
    return emptyLearningProgress()
  }
}
let fallback = emptyLearningProgress()
let volatileOnly = false
export function readLearningProgress(): LearningProgress {
  if (volatileOnly) return fallback
  try {
    return decodeLearningProgress(window.localStorage.getItem(learningStorageKey))
  } catch {
    return fallback
  }
}
export type StudySection = 'learn' | 'puzzles'
export function updateLearningProgress(
  old: LearningProgress,
  section: StudySection,
  id: string,
  correct: boolean,
  date: string,
): LearningProgress {
  if (!correct && section === 'learn') return old
  const next = { ...old, activity: old.activity.map((day) => ({ ...day })) }
  let day = next.activity.find((row) => row.date === date)
  if (!day) {
    day = { date, lessons: 0, solved: 0, attempts: 0 }
    next.activity.push(day)
  }
  if (section === 'learn' && correct && !old.lessonsCompleted.includes(id)) {
    next.lessonsCompleted = [...old.lessonsCompleted, id]
    day.lessons++
  }
  if (section === 'puzzles') {
    next.puzzleAttempts++
    day.attempts++
    if (correct) next.puzzleCorrect++
    if (correct && !old.puzzlesCompleted.includes(id)) {
      next.puzzlesCompleted = [...old.puzzlesCompleted, id]
      day.solved++
    }
  }
  return next
}
export function recordStudyAnswer(
  section: StudySection,
  id: string,
  correct: boolean,
): LearningProgress {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  const next = updateLearningProgress(readLearningProgress(), section, id, correct, date)
  fallback = next
  try {
    window.localStorage.setItem(learningStorageKey, JSON.stringify(next))
    volatileOnly = false
  } catch {
    volatileOnly = true
  }
  return next
}
