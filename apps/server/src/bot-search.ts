import { Worker } from 'node:worker_threads'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { chooseHeuristic, sameDecision } from '../../../packages/bots/src'
import type { GameAction, PlayerView } from '../../../packages/game-engine/src'

interface Task {
  view: PlayerView
  legal: GameAction[]
  signal: AbortSignal
  done: (move: GameAction | undefined) => void
  abort: () => void
}
interface Slot {
  worker: Worker
  task?: Task
  timeout?: ReturnType<typeof setTimeout>
}

/** Two reusable workers share CPU across all rooms. A full queue uses a legal heuristic move. */
export class BotSearch {
  private queue: Task[] = []
  private slots = new Set<Slot>()
  private stopped = false
  constructor(private workerFile = resolve('.build', 'bot-worker.cjs')) {}
  choose(view: PlayerView, legal: GameAction[], signal: AbortSignal): Promise<GameAction | undefined> {
    if (this.stopped || signal.aborted) return Promise.resolve(undefined)
    if (legal.length <= 1) return Promise.resolve(legal[0])
    if (this.queue.length >= 32 || !existsSync(this.workerFile))
      return Promise.resolve(this.fallback(view, legal))
    return new Promise((resolve) => {
      const task: Task = { view, legal, signal, done: resolve, abort: () => this.cancel(task) }
      signal.addEventListener('abort', task.abort, { once: true })
      this.queue.push(task)
      this.pump()
    })
  }
  private fallback(view: PlayerView, legal: GameAction[]) {
    return chooseHeuristic(view, legal, { difficulty: 'intermediate' }).action
  }
  private cancel(task: Task) {
    const i = this.queue.indexOf(task)
    if (i >= 0) {
      this.queue.splice(i, 1)
      this.settle(task, undefined)
      return
    }
    for (const slot of this.slots)
      if (slot.task === task) {
        this.retire(slot)
        break
      }
  }
  private settle(task: Task, move: GameAction | undefined) {
    task.signal.removeEventListener('abort', task.abort)
    task.done(move)
  }
  private retire(slot: Slot) {
    if (!this.slots.delete(slot)) return
    clearTimeout(slot.timeout)
    void slot.worker.terminate()
    if (slot.task) {
      const t = slot.task
      slot.task = undefined
      this.settle(t, t.signal.aborted || this.stopped ? undefined : this.fallback(t.view, t.legal))
    }
    this.pump()
  }
  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(this.workerFile) }
    this.slots.add(slot)
    slot.worker.on('message', (action: GameAction) => {
      const t = slot.task
      if (!t) return
      clearTimeout(slot.timeout)
      slot.task = undefined
      const accepted =
        t.legal.find((option) => sameDecision(option, action)) ?? this.fallback(t.view, t.legal)
      this.settle(t, accepted)
      this.pump()
    })
    slot.worker.on('error', () => this.retire(slot))
    slot.worker.on('exit', () => this.retire(slot))
    slot.worker.unref()
    return slot
  }
  private pump() {
    while (!this.stopped && this.queue.length) {
      let slot = [...this.slots].find((candidate) => !candidate.task)
      if (!slot && this.slots.size >= 2) return
      const task = this.queue.shift()!
      if (!slot) {
        try {
          slot = this.spawn()
        } catch {
          this.settle(task, this.fallback(task.view, task.legal))
          continue
        }
      }
      slot.task = task
      const active = slot
      slot.timeout = setTimeout(() => this.retire(active), 4000)
      slot.timeout.unref()
      try {
        slot.worker.postMessage({ view: task.view, legal: task.legal })
      } catch {
        this.retire(slot)
      }
    }
  }
  dispose() {
    this.stopped = true
    for (const t of this.queue.splice(0)) this.settle(t, undefined)
    for (const slot of this.slots) this.retire(slot)
  }
}
