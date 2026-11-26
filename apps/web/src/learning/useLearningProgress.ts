import { useEffect, useState } from 'react'
import { learningStorageKey, readLearningProgress } from './progress'

export function useLearningProgress() {
  const state = useState(readLearningProgress)
  const [, setProgress] = state
  useEffect(() => {
    function refresh(event: StorageEvent) {
      if (event.key === learningStorageKey || event.key === null) setProgress(readLearningProgress())
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])
  return state
}
