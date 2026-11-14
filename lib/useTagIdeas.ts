import { useEffect, useState } from 'react'

import { crewsApi } from './crewsApi'
import { Logger } from './logger'

/**
 * The hashtag ideas a crew is offered (`GET /crews` → `tagIdeas`, admin #981), without the #. Read once `active` is
 * first true; a failed read is no ideas, never an error: typing your own still works.
 */
export function useTagIdeas(active = true): string[] {
  const [ideas, setIdeas] = useState<string[]>([])
  const [asked, setAsked] = useState(false)
  if (active && !asked) setAsked(true)
  useEffect(() => {
    if (!asked) return
    let live = true
    // A promise chain from the start, so a mock or a throw is the same as a failed read.
    void Promise.resolve()
      .then(() => crewsApi.myCrews())
      .then((result) => {
        if (live && result?.success && Array.isArray(result.data?.tagIdeas)) setIdeas(result.data.tagIdeas)
      })
      .catch((error: unknown) => Logger.warn('api', 'Could not read the crew tag ideas', { error: error as never }))
    return () => {
      live = false
    }
  }, [asked])
  return ideas
}
