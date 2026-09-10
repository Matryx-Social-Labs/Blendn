import * as Haptics from 'expo-haptics'
import React, { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { apiClient } from '../lib/apiClient'
import { pickableItems, toPickerTree, type CategoryGroup, type CategoryNode } from '../lib/categories'
import { Logger } from '../lib/logger'
import { EMBER, EMBER_FONTS } from '../lib/theme'

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

export function InterestPicker({
  selected,
  onChange,
  max = MAX_INTERESTS,
  onLoadStateChange,
}: {
  selected: string[]
  onChange: (next: string[]) => void
  max?: number
  /**
   * Told to the caller so a Continue button can avoid becoming a dead end.
   *
   * Onboarding gated Continue on `selected.length === 0` alone, which meant an
   * empty category list — a flaky network, a bad deploy, an unseeded database —
   * left the user with nothing to tap and no way forward, in a flow with no
   * skip and no back. Whatever the cause, they were stuck in the app forever.
   */
  onLoadStateChange?: (state: { loading: boolean; available: number }) => void
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

  useEffect(() => {
    onLoadStateChange?.({ loading, available })
    // `onLoadStateChange` is intentionally not a dependency: callers pass an
    // inline arrow, and including it would re-fire on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, available])

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      Haptics.selectionAsync().catch(() => {})
      onChange(selected.filter((i) => i !== id))
      return
    }
    if (selected.length >= max) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
      return
    }
    Haptics.selectionAsync().catch(() => {})
    onChange([...selected, id])
  }

  return (
    <View>
      <Text style={styles.counter}>
        Selected: {selected.length}/{max}
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
          <Text style={styles.groupHeading} accessibilityRole="header">
            {group.name}
          </Text>
          <View style={styles.grid}>
            {group.items.map((category) => {
              const isSelected = selected.includes(category.id)
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.chip, isSelected ? styles.chipSelected : styles.chipIdle]}
                  onPress={() => toggle(category.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  // The group name is in the label because "Workshops" appears
                  // under both Arts & Culture and Business, and a screen reader
                  // moving chip to chip has no other way to tell them apart.
                  accessibilityLabel={`${category.name}, in ${group.name}`}
                >
                  <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>
                    {category.icon ? `${category.icon} ${category.name}` : category.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { marginBottom: 18 },
  groupHeading: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  counter: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 12,
  },
  notice: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  /*
   * The same chip as `profile/MatchingFields`, which is one card below this one
   * on the same screen.
   *
   * They disagreed: work field filled with the accent when picked, interests
   * went to a white outline — two answers to "what does chosen look like",
   * a thumb-scroll apart. This file also carried six raw colour values and a
   * `fontWeight: '600'`, where the other is on `EMBER` and `EMBER_FONTS`
   * throughout, so aligning to it is the direction that removes literals rather
   * than adding them.
   *
   * Not extracted into a shared `Chip` yet, deliberately: the client has no
   * primitives layer, and the plan sequences tokens before primitives precisely
   * so a shared component is not built on values still being resolved. When it
   * is built, these two are its first callers.
   */
  chipIdle: {
    backgroundColor: 'rgba(45,44,44,0.4)',
    borderColor: 'rgba(73,71,71,0.1)',
  },
  chipSelected: {
    backgroundColor: EMBER.accent,
    borderColor: EMBER.accent,
  },
  chipText: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 15,
    color: EMBER.textPrimary,
  },
  /* Dark on warm — white on the accent fails contrast. */
  chipTextSelected: {
    fontFamily: EMBER_FONTS.bodyBold,
    color: EMBER.onGradientChip,
  },
})
