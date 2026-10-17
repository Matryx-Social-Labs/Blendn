import { Image } from 'expo-image'

/** How many faces' photos the Room waits for: the hero's pile, Meet next and the first rows of the grid. */
const AVATARS_FIRST = 12
/** The longest the Room waits on those photos; a slow image never holds the room past this. */
const AVATARS_WAIT_MS = 1500

/** Warm expo-image's cache for the first faces, bounded: resolves when they are in, or at AVATARS_WAIT_MS. */
export function warmAvatars(photos: readonly (string | null | undefined)[]): Promise<void> {
  const urls = [...new Set(photos.filter((u): u is string => !!u))].slice(0, AVATARS_FIRST)
  if (!urls.length) return Promise.resolve()
  return Promise.race([
    Image.prefetch(urls, { cachePolicy: 'memory-disk' }).then(
      () => undefined,
      () => undefined
    ),
    new Promise<void>((resolve) => setTimeout(resolve, AVATARS_WAIT_MS)),
  ])
}
