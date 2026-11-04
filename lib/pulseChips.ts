/**
 * The chips that are the Pulse's header (Flow 3 · Pulse, Option C, owner pick 2026-11-03), as plain data: Tonight and
 * This weekend with counts, Within 2 km where distance means something, one vibe from the week's data, then Filters.
 *
 * Each chip is a filter the feed already takes (`lib/eventFilters.ts`), so a chip is lit exactly when its filter is on
 * and a count is the server's for the same query (`GET /events` `pagination.totalCount`): the number on the chip is what
 * a tap shows.
 */

import { appliedFilters, WHEN_LABELS, type AppliedFilter, type EventFilters } from './eventFilters'
import { categoryChips, printable } from './pulseSections'

export type QuickKey = 'tonight' | 'weekend' | 'near' | 'vibe'

/** "Within 2 km": the distance chip's radius. */
export const NEAR_KM = 2

export type Vibe = { slug: string; name: string }

export type QuickChip = {
  key: QuickKey
  label: string
  /** "1,038": the server's count, grouped; none under five (`printable`). */
  count?: string
  selected: boolean
  accessibilityLabel: string
}

/** A chip's count as it is printed: five and up, grouped the US way. */
export const chipCount = (n: number | null | undefined): string | undefined => {
  const shown = printable(n)
  return shown === null ? undefined : shown.toLocaleString('en-US')
}

export function quickChips(input: {
  filters: EventFilters
  counts: { tonight: number | null; weekend: number | null }
  /** Location is on and the phone is in the browsed city: a distance means something. */
  nearOn: boolean
  vibe: Vibe | null
}): QuickChip[] {
  const { filters, counts, nearOn, vibe } = input
  const chip = (key: QuickKey, label: string, selected: boolean, n?: number | null): QuickChip => {
    const count = chipCount(n)
    return { key, label, count, selected, accessibilityLabel: count ? `${label}, ${count} events` : label }
  }
  return [
    chip('tonight', WHEN_LABELS.today, filters.when === 'today', counts.tonight),
    chip('weekend', WHEN_LABELS.weekend, filters.when === 'weekend', counts.weekend),
    ...(nearOn ? [chip('near', `Within ${NEAR_KM} km`, filters.radiusKm === NEAR_KM)] : []),
    ...(vibe ? [chip('vibe', vibe.name, filters.categorySlug === vibe.slug)] : []),
  ]
}

/** The filters with one chip pressed: Tonight and This weekend are one choice; distance and the vibe toggle their own field. */
export function toggleQuick(filters: EventFilters, key: QuickKey, vibe: Vibe | null): EventFilters {
  switch (key) {
    case 'tonight':
      return { ...filters, when: filters.when === 'today' ? 'any' : 'today' }
    case 'weekend':
      return { ...filters, when: filters.when === 'weekend' ? 'any' : 'weekend' }
    case 'near':
      return { ...filters, radiusKm: filters.radiusKm === NEAR_KM ? undefined : NEAR_KM }
    case 'vibe':
      return { ...filters, categorySlug: !vibe || filters.categorySlug === vibe.slug ? undefined : vibe.slug }
  }
}

/** The applied filters no chip stands for (set in the sheet): drawn first in the row, each removable. */
export function extraApplied(filters: EventFilters, categories: readonly Vibe[], vibe: Vibe | null): AppliedFilter[] {
  return appliedFilters(filters, categories).filter(
    (a) =>
      !(a.field === 'when' && (filters.when === 'today' || filters.when === 'weekend')) &&
      !(a.field === 'radiusKm' && filters.radiusKm === NEAR_KM) &&
      !(a.field === 'categorySlug' && vibe && filters.categorySlug === vibe.slug)
  )
}

/** The week's vibe: the busiest top-level category in the loaded events (start order, so the nearest days), by its server name. */
export function vibeOf(events: readonly { category_group?: string | null }[], options: readonly Vibe[]): Vibe | null {
  const [top] = categoryChips(events, options)
  return top ? { slug: top.slug, name: top.name } : null
}
