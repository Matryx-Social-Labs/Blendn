/**
 * Which asset a feed card should draw, given an event's media.
 *
 * ## No new column was needed for video
 *
 * `event_media` has existed since before the Pulse rebuild, with a `type` of
 * `image | video | document`, a `url`, a `thumbnail_url` and an `order` — and
 * `GET /events` has been serving all five fields the whole time. Adding a
 * `cover_video_url` beside `cover_image_url` would have been a second place to
 * write the same fact, and the day they disagreed the card would have shown one
 * event's poster over another's clip.
 *
 * So a clip is simply the first `video` row, and this file is the one place
 * that decides what "first" means.
 *
 * ## The poster is never allowed to be missing
 *
 * A card whose video is still buffering shows its poster, so a poster that is
 * `null` is a black rectangle for the length of a network round trip. The
 * fallback chain is the clip's own `thumbnail_url`, then the event's
 * `cover_image_url`, then nothing — and "nothing" means this returns no clip at
 * all rather than a clip that will flash black.
 *
 * That last rule is the one worth stating out loud: **we would rather show a
 * still event than a broken-looking one.** An organiser who uploads a video and
 * no poster gets their photograph, not a black card, and the upload path is
 * where that should be fixed rather than here.
 */

export interface EventMediaItem {
  id?: string
  url?: string | null
  thumbnail_url?: string | null
  type?: string | null
  order?: number | null
}

export interface FeedClip {
  videoUrl: string
  /** Painted underneath the player, always. Never null — see above. */
  posterUrl: string
}

/**
 * The clip a card should play, or `null` for a still card.
 *
 * `coverImageUrl` is the event's own cover, used when the clip carries no
 * thumbnail of its own.
 */
export function feedClip(
  media: readonly EventMediaItem[] | null | undefined,
  coverImageUrl?: string | null
): FeedClip | null {
  if (!Array.isArray(media)) return null

  /*
   * `order` decides, not array position.
   *
   * The API sorts by `order` today, so the two agree — but this receives a
   * plain array through `eventFromApi`, and a caller that merges or filters
   * media would silently change which clip plays. Sorting here costs nothing on
   * a list capped at five and makes the choice independent of how it arrived.
   */
  const videos = media
    .filter((m) => m?.type === 'video' && typeof m.url === 'string' && m.url.length > 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const clip = videos[0]
  if (!clip?.url) return null

  const posterUrl = clip.thumbnail_url || coverImageUrl
  if (!posterUrl) return null

  return { videoUrl: clip.url, posterUrl }
}

/**
 * The still a card should draw when it is not playing anything.
 *
 * Prefers the event's cover, then any image in `media`. An event whose only
 * media is a video still gets the clip's thumbnail, so the card is never blank
 * while it waits.
 */
export function feedPoster(
  media: readonly EventMediaItem[] | null | undefined,
  coverImageUrl?: string | null
): string | null {
  if (coverImageUrl) return coverImageUrl
  if (!Array.isArray(media)) return null

  const sorted = [...media]
    .filter((m) => typeof m?.url === 'string' && m.url.length > 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const image = sorted.find((m) => m.type === 'image')
  if (image?.url) return image.url

  const withThumb = sorted.find((m) => m.thumbnail_url)
  return withThumb?.thumbnail_url ?? null
}
