/** A photo in the onboarding grid: one the server has, one on its way, or one that did not get there (kept for Retry). */
export type PhotoTile =
  | { key: string; state: 'ready'; url: string }
  | { key: string; state: 'uploading'; uri: string; progress: number }
  | { key: string; state: 'failed'; uri: string }

/** The photos Continue sends: the ones the server has, in order. A tile still on its way is not one yet. */
export const readyPhotos = (tiles: readonly PhotoTile[]): string[] => tiles.flatMap((tile) => (tile.state === 'ready' ? [tile.url] : []))

/** What the caption says by how many photos there are. */
export function photoNote(count: number): string {
  if (count === 0) return 'Your main photo is the one people see on your profile and in messages. Add up to 6.'
  if (count === 1) return 'This is your main photo. Add more and you can pick a different one.'
  return 'Tap any photo to make it your main one. JPG and PNG, up to 6.'
}

/** The tiles with `key` moved to the front: `photos[0]` is what everyone else sees. An unknown key changes nothing. */
export function withMainFirst<T extends { key: string }>(tiles: readonly T[], key: string): T[] {
  const chosen = tiles.find((tile) => tile.key === key)
  return chosen ? [chosen, ...tiles.filter((tile) => tile.key !== key)] : [...tiles]
}

/**
 * The draft's photos less the ones moderation has since pulled: what the draft still lists that the server's own profile no longer
 * does. Only the tiles the draft itself put there (their key is their URL) are judged; a photo uploaded on this screen and not yet
 * saved is not in the profile's list, and it stays. Continue would otherwise send a pulled URL back, and the server refuses the lot.
 */
export function withoutPulledDraftPhotos(tiles: readonly PhotoTile[], live: readonly string[]): PhotoTile[] {
  const up = new Set(live)
  return tiles.filter((tile) => !(tile.state === 'ready' && tile.key === tile.url) || up.has(tile.url))
}
