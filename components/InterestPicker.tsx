import React, { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { apiClient } from '../lib/apiClient'
import { pickableItems, toPickerTree, type CategoryGroup, type CategoryNode } from '../lib/categories'
import { Logger } from '../lib/logger'
import { SPACE, TYPE } from '../lib/theme'
import { ChipSet } from './ds/ChipSet'

/**
 * Pick what you are into, from the server's taxonomy.
 *
 * Extracted from the onboarding screen that is being deleted, because three
 * places need it: the new about-you screen, edit-profile (which currently
 * writes **free text** to `profiles.interests` — the column
 * `lib/interest-coverage.ts` exists to warn nobody reads), and the per-event
 * screen later.
 *
 * It has already had one non-obvious bug, which is the other reason it is a
 * component rather than three copies: `GET /categories` returns a tree, and the
 * screen read it as a flat list, discarding 100% of the response. See
 * `lib/categories.ts` and `__tests__/categories.test.ts`.
 *
 * ## Deliberately uncontrolled about *saving*
 *
 * The picker owns loading and selection; the caller owns the write. About-you
 * saves interests and profile fields in **one transactional call** — two
 * ordered writes look safe and are not, because the re-prompt keys on the
 * interest count, so a failure after the interests land means the second half
 * is lost permanently and never asked for again.
 *
 * ## Design is a placeholder
 *
 * Chips on a dark background, the shape the onboarding screen used. The Figma
 * redesign lands separately; this exists so the logic is right and reusable
 * before anyone styles it. See `docs/PLACEHOLDER_SCREENS.md`.
 */

/**
 * Ten, and the server enforces it too — as of the Stage 2 change.
 *
 * This comment used to claim the server rejected more than this per call. It
 * did not: there was no cap anywhere in `POST /profiles/:id/interests`, and
 * this constant was the only thing holding the line. It is real now
 * (`lib/constants.ts` in blendn-admin), which matters because ranking sums IDF
 * weights over shared interests — and IDF damps a category *many people* hold,
 * not one person holding *many categories*. Ticking all 67 would have put you
 * top of every list in the room.
 */
export const MAX_INTERESTS = 10
/** Interests drawn per group before "+n more"; a chosen one beyond them stays drawn. */
const INTERESTS_SHOWN = 12

export function InterestPicker({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [groups, setGroups] = useState<CategoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiClient
      .getCategories()
      .then((res) => {
        if (cancelled) return
        if (res.success && Array.isArray(res.data)) {
          setGroups(toPickerTree(res.data as unknown as CategoryNode[]))
        } else {
          setFailed(true)
        }
      })
      .catch((e) => {
        Logger.error('profile', 'Category load failed', { error: e })
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const available = useMemo(() => pickableItems(groups).length, [groups])

  const toggle = (id: string) => {
    // The chip plays H.select itself; at the cap the rest are dimmed and a tap does nothing.
    if (selected.includes(id)) return onChange(selected.filter((i) => i !== id))
    if (selected.length >= MAX_INTERESTS) return
    onChange([...selected, id])
  }

  return (
    <View>
      <Text style={styles.counter}>
        Selected: {selected.length}/{MAX_INTERESTS}
      </Text>

      {loading ? (
        <Text style={styles.notice}>Loading interests…</Text>
      ) : failed || available === 0 ? (
        // An honest message beats an empty grid that reads as "the app has
        // nothing to offer". The caller lets them continue regardless.
        <Text style={styles.notice}>
          Couldn&apos;t load interests. You can add them later from your profile.
        </Text>
      ) : null}

      {/*
        Grouped, not flat. The heading is a place to look, not a thing to tap —
        `accessibilityRole="header"` says so to a screen reader, which would
        otherwise read thirteen unlabelled section titles as more options.
      */}
      {groups.map((group) => (
        <View key={group.id} style={styles.group}>
          <ChipSet
            label={group.name.toUpperCase()}
            items={group.items.map((category) => ({
              key: category.id,
              // The server's emoji is not drawn (no emoji as UI); the chip's ✓ draws on select.
              label: category.name,
              // The group name is in the label because "Workshops" appears under both Arts & Culture and Business, and a
              // screen reader moving chip to chip has no other way to tell them apart.
              accessibilityLabel: `${category.name}, in ${group.name}`,
              // The cap is the picker's, across every group: the rest dim, and say why.
              dimmed: selected.length >= MAX_INTERESTS && !selected.includes(category.id),
            }))}
            selection="multi"
            selected={selected}
            capHint={`Up to ${MAX_INTERESTS}`}
            foldAfter={INTERESTS_SHOWN}
            foldNoun={`in ${group.name}`}
            onToggle={toggle}
            testID={`interests-${group.id}`}
          />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginBottom: SPACE.xl },
  counter: { ...TYPE.meta, marginBottom: SPACE.md },
  notice: { ...TYPE.meta, marginBottom: SPACE.md },
})
