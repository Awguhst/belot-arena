import { describe, expect, it } from 'vitest'
import { RULESET } from '@belot/game-engine'
import { solvePuzzle, validatePuzzle } from './grade'
import { puzzles } from './puzzles'
import { lessons } from './lessons'
import { decodeLearningProgress, emptyLearningProgress, updateLearningProgress } from './progress'

describe('academy curriculum', () => {
  it('links fifteen bilingual lessons to distinct playable scenarios', () => {
    expect(lessons).toHaveLength(15)
    expect(new Set(lessons.map((lesson) => lesson.puzzleId)).size).toBe(15)
    for (const lesson of lessons) {
      expect(puzzles.some((puzzle) => puzzle.id === lesson.puzzleId)).toBe(true)
      for (const locale of ['bg', 'en'] as const) {
        expect(lesson.topic[locale]).toBeTruthy()
        expect(lesson.explanation[locale]).toBeTruthy()
      }
    }
  })
  it('covers each requested exercise category', () => {
    expect(puzzles.length).toBeGreaterThanOrEqual(20)
    expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(puzzles.length)
    for (const category of [
      'legal',
      'winner',
      'trump',
      'overtrump',
      'bid',
      'declaration',
      'score',
      'partner',
    ]) {
      expect(puzzles.some((puzzle) => puzzle.category === category)).toBe(true)
    }
  })
  it.each(puzzles)('checks $id against the live deterministic rules', (puzzle) => {
    expect(puzzle.ruleset).toBe(RULESET)
    expect(validatePuzzle(puzzle)).toEqual([])
    for (const locale of ['bg', 'en'] as const) {
      expect(puzzle.prompt[locale]).toBeTruthy()
      expect(puzzle.explanation[locale]).toBeTruthy()
    }
  })
  it('accepts both reasonable discards in the partner exercise', () => {
    const donation = puzzles.find((puzzle) => puzzle.id === 'load-your-partner')!
    expect(solvePuzzle(donation).sort()).toEqual(['10d', '10s'])
  })
})

describe('learning progress', () => {
  it('migrates older data, filters retired ids and ignores malformed saves', () => {
    expect(decodeLearningProgress('{broken')).toEqual(emptyLearningProgress())
    const migrated = decodeLearningProgress(
      JSON.stringify({
        version: 1,
        lessons: ['deck', 'old', 'deck'],
        puzzles: ['four-nines'],
        attempts: 2,
        correct: 9,
      }),
    )
    expect(migrated.lessonsCompleted).toEqual(['deck'])
    expect(migrated.puzzlesCompleted).toEqual(['four-nines'])
    expect(migrated.puzzleCorrect).toBe(2)
    expect(decodeLearningProgress(JSON.stringify(migrated))).toEqual(migrated)
  })
  it('records each answer and counts unique completions independently of replays', () => {
    const date = '2026-11-25'
    let progress = updateLearningProgress(emptyLearningProgress(), 'learn', 'deck', true, date)
    progress = updateLearningProgress(progress, 'learn', 'deck', true, date)
    progress = updateLearningProgress(progress, 'puzzles', 'four-nines', false, date)
    progress = updateLearningProgress(progress, 'puzzles', 'four-nines', true, date)
    progress = updateLearningProgress(progress, 'puzzles', 'four-nines', true, date)
    expect(progress.lessonsCompleted).toEqual(['deck'])
    expect(progress.puzzlesCompleted).toEqual(['four-nines'])
    expect(progress.puzzleAttempts).toBe(3)
    expect(progress.puzzleCorrect).toBe(2)
    expect(progress.activity).toEqual([{ date, lessons: 1, solved: 1, attempts: 3 }])
  })
})
