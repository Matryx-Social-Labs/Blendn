import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { COLOR, MAX_FONT_SCALE, SPACE, TYPE } from '../../lib/design/tokens'
import { noteCrewUnblocked } from '../../lib/crewWaveBack'
import type { HiddenCrew } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { showSheet } from '../../lib/sheet'
import { calendarDate } from '../../lib/time'
import { OPACITY } from '../../lib/theme'
import { Button } from '../ds/Button'
import { CrewRow } from '../ds/CrewCard'
import { SectionHeader } from '../ds/SectionHeader'
import { font, minTarget, useBoldText } from '../ds/shared'

/** The crews shown before "Show all N" (advisor B-A: crews first while they are few). */
export const BLOCKED_CREWS_FIRST = 3
/** "Show all": the server's page cap. */
const ALL_PAGE = 50

type Read = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; crews: HiddenCrew[]; total: number; hasMore: boolean; page: number; limit: number }

/**
 * Settings → Blocked, the crews you blocked (task 17 b1, advisor B-A 2026-11-25): "Crews · N" above People, the caption, a
 * row per crew (its emblem, never a face; the name wraps to two lines) with a neutral Unblock behind a confirm. The first
 * few, then "Show all N". Nothing at all when there are none.
 */
export function BlockedCrews({ onCount }: { onCount?: (count: number) => void }) {
  const bold = useBoldText()
  const [read, setRead] = useState<Read>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  /** An answer lands: page 1 replaces, a later page appends without repeats; a failure keeps what is on screen. */
  const settle = useCallback((result: Awaited<ReturnType<typeof crewsApi.hiddenCrews>>, page: number, limit: number) => {
    if (!result.success || !result.data) {
      setRead((prev) => (prev.status === 'ready' ? prev : { status: 'failed' }))
      return
    }
    const { crews, pagination } = result.data
    setRead((prev) => {
      const before = page > 1 && prev.status === 'ready' ? prev.crews : []
      const have = new Set(before.map((c) => c.crewId))
      return { status: 'ready', crews: [...before, ...crews.filter((c) => !have.has(c.crewId))], total: pagination.totalCount, hasMore: pagination.hasMore, page, limit }
    })
  }, [])

  const load = async (page: number, limit: number) => {
    const mine = ++seq.current
    const result = await crewsApi.hiddenCrews(page, limit)
    if (mine === seq.current) settle(result, page, limit)
  }

  useEffect(() => {
    const mine = ++seq.current
    void crewsApi.hiddenCrews(1, BLOCKED_CREWS_FIRST).then((result) => {
      if (mine === seq.current) settle(result, 1, BLOCKED_CREWS_FIRST)
    })
  }, [settle])

  const total = read.status === 'ready' ? read.total : 0
  useEffect(() => onCount?.(total), [onCount, total])

  const more = async () => {
    if (read.status !== 'ready' || busy) return
    setBusy(true)
    // The first few were a short page: "Show all" starts over at the full page size, then pages on.
    await (read.limit < ALL_PAGE ? load(1, ALL_PAGE) : load(read.page + 1, ALL_PAGE))
    setBusy(false)
  }

  const unblock = (crew: HiddenCrew) =>
    showSheet({
      kind: 'actions',
      hue: 'violet',
      title: `Unblock ${crew.name}?`,
      message: `${crew.name} can show in your rooms again. Its members aren’t told.`,
      actions: [
        {
          label: 'Unblock',
          variant: 'secondary',
          run: async () => {
            const result = await crewsApi.unhideCrew(crew.crewId)
            if (!result.success) return { ok: false, error: 'Couldn’t unblock it. Try again.' }
            noteCrewUnblocked(crew.crewId)
            setRead((prev) =>
              prev.status === 'ready' ? { ...prev, crews: prev.crews.filter((c) => c.crewId !== crew.crewId), total: Math.max(0, prev.total - 1) } : prev
            )
            return { ok: true, toast: `${crew.name} is unblocked` }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })

  if (read.status === 'loading') return null
  if (read.status === 'failed') {
    return (
      <Pressable
        onPress={() => {
          setRead({ status: 'loading' })
          void load(1, BLOCKED_CREWS_FIRST)
        }}
        accessibilityRole="button"
        hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
        style={({ pressed }) => [styles.group, pressed && styles.pressed]}
        testID="blocked-crews-retry"
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.quiet]}>Blocked crews didn’t load. Tap to try again.</Text>
      </Pressable>
    )
  }
  if (read.crews.length === 0) return null

  const left = read.total - read.crews.length
  return (
    <View style={styles.group} testID="blocked-crews">
      <SectionHeader title="Crews" count={read.total} caption="You won’t see these crews in any room. They aren’t told." />
      {read.crews.map((crew) => (
        <CrewRow
          key={crew.crewId}
          name={crew.name}
          emblemSeed={crew.emblemSeed}
          size={0}
          sub={`Crew · blocked ${calendarDate(crew.hiddenAt)}`.trim()}
          trailing={<Button kind="secondary" size="sm" label="Unblock" accessibilityLabel={`Unblock ${crew.name}`} onPress={() => unblock(crew)} style={styles.centred} />}
          testID={`blocked-crew-${crew.crewId}`}
        />
      ))}
      {read.hasMore && left > 0 ? (
        <Button kind="tertiary" size="sm" label={read.limit < ALL_PAGE ? `Show all ${read.total.toLocaleString('en-US')}` : 'Show more'} loading={busy} onPress={() => void more()} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  centred: { alignSelf: 'center' },
  group: { gap: SPACE.xs, paddingBottom: SPACE.md },
  quiet: { color: COLOR.textSecondary },
  pressed: { opacity: OPACITY.pressed },
})
