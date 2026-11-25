/** Decision randomness has a separate stream from the shuffle. */
export function randomStream(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let end = result.length - 1; end > 0; end--) {
    const other = Math.floor(random() * (end + 1))
    ;[result[end], result[other]] = [result[other], result[end]]
  }
  return result
}
