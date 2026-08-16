import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Every image inside a virtualised list carries a `recyclingKey`.
 *
 * ## The failure this prevents is invisible in a screenshot
 *
 * `expo-image` reuses native views inside a `FlatList`. Without a key it has
 * no way to know the view it just handed you was showing something else, so a
 * row scrolling into place paints the **previous** row's picture for a frame
 * or two and then dissolves into its own.
 *
 * It reads as a flicker, it is worst on exactly the fast scroll a feed
 * invites, and a still capture never shows it — which is why nine of these
 * shipped unkeyed across eight files. `SceneHeroMedia` had one from the start
 * because it uses `expo-image` directly; `OptimizedImage` did not expose the
 * prop at all, so nothing rendering through it could pass one.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

/** Files that render `OptimizedImage` inside a virtualised list. */
const LIST_SURFACES = [
  ['components', 'pulse', 'FeedMedia.tsx'],
  ['components', 'pulse', 'UpcomingCard.tsx'],
  ['components', 'EventCard.tsx'],
  ['components', 'screens', 'MatchScreen.tsx'],
  ['app', '(tabs)', 'events.tsx'],
  ['app', '(tabs)', 'chat.tsx'],
  ['app', 'chat', '[id].tsx'],
  ['app', 'private-chat', '[conversationId].tsx'],
]

describe('image recycling', () => {
  it('OptimizedImage accepts and forwards a recyclingKey', () => {
    /*
     * Forwarding matters as much as accepting: the component renders up to
     * four `<Image>`s — placeholder, low quality, high quality, fallback — and
     * a key on only some of them leaves the others free to flash.
     */
    const src = read('components', 'OptimizedImage.tsx')
    expect(src).toContain('recyclingKey?: string')
    // Once in the props, once in the destructure, and once per rendered Image.
    expect((src.match(/recyclingKey/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('every image in a virtualised list passes one', () => {
    const missing: string[] = []
    for (const parts of LIST_SURFACES) {
      const src = read(...parts)
      const images = (src.match(/<OptimizedImage/g) ?? []).length
      const keys = (src.match(/recyclingKey=/g) ?? []).length
      if (keys < images) missing.push(`${parts.join('/')} (${keys}/${images})`)
    }
    // Named rather than counted, so a failure says which file to fix.
    expect(missing).toEqual([])
  })

  it('the hero keeps the one it always had', () => {
    // `SceneHeroMedia` uses expo-image directly and was the only surface that
    // ever set this. It is the reference, not an exception.
    expect(read('components', 'scene', 'SceneHeroMedia.tsx')).toContain('recyclingKey=')
  })
})
