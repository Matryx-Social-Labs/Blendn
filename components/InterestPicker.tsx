import * as Haptics from 'expo-haptics'
import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { apiClient } from '../lib/apiClient'
import { flattenToLeaves, type Category, type CategoryNode } from '../lib/categories'
import { Logger } from '../lib/logger'

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

/** The server rejects more than this per call, and a card cannot show more. */
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
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiClient
      .getCategories()
      .then((res) => {
        if (cancelled) return
        if (res.success && Array.isArray(res.data)) {
          setCategories(flattenToLeaves(res.data as unknown as CategoryNode[]))
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

  useEffect(() => {
    onLoadStateChange?.({ loading, available: categories.length })
    // `onLoadStateChange` is intentionally not a dependency: callers pass an
    // inline arrow, and including it would re-fire on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, categories.length])

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
      ) : failed || categories.length === 0 ? (
        // An honest message beats an empty grid that reads as "the app has
        // nothing to offer". The caller lets them continue regardless.
        <Text style={styles.notice}>
          Couldn&apos;t load interests. You can add them later from your profile.
        </Text>
      ) : null}

      <View style={styles.grid}>
        {categories.map((category) => {
          const isSelected = selected.includes(category.id)
          return (
            <TouchableOpacity
              key={category.id}
              style={[styles.chip, isSelected ? styles.chipSelected : styles.chipIdle]}
              onPress={() => toggle(category.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={category.name}
            >
              <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>
                {category.icon ? `${category.icon} ${category.name}` : category.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
  chipIdle: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chipSelected: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: '#FFFFFF',
  },
  chipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
})
