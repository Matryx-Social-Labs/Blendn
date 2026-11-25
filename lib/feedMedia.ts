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
 * ## A still is never missing; a clip's poster may be
 *
 * `feedPoster` (a card's still) falls back from the cover to any image to a
 * clip's thumbnail, so a card is never blank. `feedPlaylist` gives a clip only
 * its own `thumbnail_url` as a poster, never the cover: a poster at another
 * ratio shows around a letterboxed clip (SCRUM-1066). The upload path is where
 * a missing first-frame poster should be fixed, not here.
 */

import { mediaFocus, mediaSize, type Focus, type Rendition, type Size } from './mediaFit'

export interface EventMediaItem {
  id?: string
  url?: string | null
  thumbnail_url?: string | null
  /** The detail route's spelling (`events/[eventId]/route.ts`); the list sends `thumbnail_url` (ROOM-12). */
  thumbnailUrl?: string | null
  type?: string | null
  order?: number | null
  /** Pixels as displayed, both or neither; null on pasted URLs and rows from before 2026-11-24 (task 20). */
  width?: number | null
  height?: number | null
  /** A clip's length: the list spells it `duration_ms`, the detail `durationMs`. */
  duration_ms?: number | null
  durationMs?: number | null
  /** The organizer's focal point, 0–1, both or neither (task 30): list snake, detail camel. */
  focal_x?: number | null
  focal_y?: number | null
  focalX?: number | null
  focalY?: number | null
  /** A checked clip's copies, smallest first (task 30); the same name on both routes. */
  renditions?: Rendition[] | null
}

/** What the server knows about one item: only what it sent, so an old row reads exactly as before (`lib/mediaFit`). */
type MediaFacts = { size?: Size; focus?: Focus }

/** One thing a card can show. */
export type FeedMediaItem =
  | ({ kind: 'image'; url: string } & MediaFacts)
  /** `posterUrl`: the clip's own still (`thumbnail_url`), or null: never the event's cover (SCRUM-1066). */
  | ({ kind: 'video'; url: string; posterUrl: string | null; durationMs?: number; renditions?: Rendition[] } & MediaFacts)

function factsOf(m: EventMediaItem | undefined): MediaFacts {
  if (!m) return {}
  const size = mediaSize(m)
  const focus = mediaFocus(m)
  return { ...(size ? { size } : {}), ...(focus ? { focus } : {}) }
}

function clipFactsOf(m: EventMediaItem): { durationMs?: number; renditions?: Rendition[] } {
  const durationMs = m.duration_ms ?? m.durationMs
  return {
    ...(typeof durationMs === 'number' && durationMs > 0 ? { durationMs } : {}),
    ...(Array.isArray(m.renditions) && m.renditions.length ? { renditions: m.renditions } : {}),
  }
}

/**
 * Media with a URL, by `order` rather than array position.
 *
 * The API sorts by `order` today, so the two agree — but this receives a plain
 * array through `eventFromApi`, and a caller that merges or filters media
 * would silently change what plays. Sorting here costs nothing on a list
 * capped at five and makes the choice independent of how it arrived.
 */
function byOrder(media: readonly EventMediaItem[]): EventMediaItem[] {
  return [...media]
    .filter((m) => typeof m?.url === 'string' && m.url.length > 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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

  const sorted = byOrder(media)

  const image = sorted.find((m) => m.type === 'image')
  if (image?.url) return image.url

  const withThumb = sorted.find((m) => m.thumbnail_url || m.thumbnailUrl)
  return withThumb?.thumbnail_url || withThumb?.thumbnailUrl || null
}


/**
 * Everything a card can show, in the order it should show it.
 *
 * ## The cover comes first, and only once
 *
 * `cover_image_url` is the picture the organiser chose to represent the event,
 * so it opens. It is then **excluded** from the rest of the walk, because an
 * organiser who uploads their cover into `media` as well — which the dashboard
 * makes easy, since the two are separate fields — would otherwise get a
 * playlist that shows the same photograph twice in a row and reads as a stuck
 * carousel rather than a loop.
 *
 * ## A clip's poster is its own, or none
 *
 * The still under a player is what shows until its first frame. It is the
 * clip's `thumbnail_url` and nothing else: the event's cover is another picture
 * at another ratio, and in the hero's `contain` frame it showed around a
 * letterboxed clip (SCRUM-1066). A clip added by URL has no thumbnail, so it
 * has no poster, and the frame's own dark surface shows until it plays.
 *
 * ## Documents never appear
 *
 * `event_media.type` allows `document`, which is a menu or a floor plan. It has
 * no business in a card that autoplays.
 */
export function feedPlaylist(
  media: readonly EventMediaItem[] | null | undefined,
  coverImageUrl?: string | null
): FeedMediaItem[] {
  const sorted = Array.isArray(media) ? byOrder(media) : []
  const out: FeedMediaItem[] = []
  // The cover is its own field with no facts of its own; when the organizer also uploaded it into media, that row's apply.
  if (coverImageUrl) out.push({ kind: 'image', url: coverImageUrl, ...factsOf(sorted.find((m) => m.url === coverImageUrl)) })

  for (const m of sorted) {
    if (m.url === coverImageUrl) continue

    if (m.type === 'image') {
      out.push({ kind: 'image', url: m.url as string, ...factsOf(m) })
      continue
    }

    if (m.type === 'video') {
      out.push({ kind: 'video', url: m.url as string, posterUrl: m.thumbnail_url || m.thumbnailUrl || null, ...factsOf(m), ...clipFactsOf(m) })
    }
  }

  return out
}

/**
 * The same playlist, with the first clip moved to the front.
 *
 * ## Why this is not what the feed does
 *
 * `feedPlaylist` leads with the cover image, and that is right for a card: a
 * card is a thumbnail in a list, and the cover is the picture the organiser
 * chose to *be* that event in a feed. Reordering it would mean the identity of
 * a card changed depending on whether a clip happened to be attached.
 *
 * Opening the event is a different act. The person has committed a tap, the
 * hero is two thirds of the screen, and the clip is the best thing the
 * organiser uploaded — so it plays first and the stills follow one by one. The
 * cover is not lost; it is the next item.
 *
 * Stable otherwise: relative order is preserved for everything else, so an
 * organiser's arrangement survives apart from the one promotion.
 */
export function clipFirst(playlist: readonly FeedMediaItem[]): FeedMediaItem[] {
  const at = playlist.findIndex((item) => item.kind === 'video')
  // -1 (no clip) and 0 (already first) are both already correct, and returning
  // a copy in every case keeps the return type honestly mutable.
  if (at <= 0) return [...playlist]
  return [playlist[at], ...playlist.slice(0, at), ...playlist.slice(at + 1)]
}
