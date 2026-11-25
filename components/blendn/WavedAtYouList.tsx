import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { apiClient, type CrewWave, type ReceivedWave } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Logger } from '../../lib/logger'
import { isCrewWave, isWavesPage, listRows, wavedAgoLine, wavedAtYouLine, waveId, waveName, type AnyWave } from '../../lib/receivedWaves'
import { Title } from '../ds/Title'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { PagedFooter } from '../friends/PagedFooter'
import { Button } from '../ds/Button'
import { WaveFace } from '../ds/WaveFace'
import { WavingHand } from '../ds/PersonCard'

/** A row: the 32 face, the name and "Waved at you · 4 min" (board 03 See all). */
const ROW = 60
/** At a larger text size the name and the line each take two lines: the row's height, per unit of text scale. */
const ROW_LARGE = 76
const FACE = 32
/** The list's share of the screen inside the tall sheet; past that it scrolls (as the crew friend picker does). */
const LIST_SHARE = 0.62
const FIRST_ROWS = 12
/** A crew that left before you waved back (404): said, never an error. */
const GONE = 'They’ve left the room'

/** Crews come on the first page only; `answeredBefore` is who you had answered when it was read (`listRows`). */
type Loaded = { open: boolean; total: number; waves: ReceivedWave[]; nextCursor: string | null; crewWaves: CrewWave[]; crewTotal: number; answeredBefore: ReadonlySet<string> }

/** How a Wave back went: stored, gone (a crew that left: "They’ve left the room"), or nothing changed. */
export type WaveBackResult = 'done' | 'gone' | 'none'

/**
 * See all (board 03 S-A): every wave to you in a room, newest first, 20 a page from the server, in a windowed list with
 * the exact count in the header. Each row answers in place: Wave back, the hand while it goes, then ✓ Waved (a wave back
 * at a person is always a mutual, so the moment follows). Crews are in it too (advisor U-A 2026-11-25, `listRows`): "Crew · 2 min
 * ago"; one that left keeps its row, says so and offers nothing. Holding a row offers Block and Report; a block takes the row off. A closed
 * room's list offers nothing to answer. A failed page keeps the rows and says so with Try again.
 */
export function WavedAtYouList({
  eventId,
  now,
  onWaveBack,
  onSafety,
}: {
  eventId: string
  now: number
  onWaveBack: (wave: AnyWave) => Promise<WaveBackResult>
  /** Block or Report; `removed` takes the row off the list. */
  onSafety: (wave: AnyWave, removed: () => void) => void
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const { height: windowHeight, fontScale } = useWindowDimensions()
  // Fixed per text size, so the list still windows by `getItemLayout`.
  const scale = Math.min(fontScale, CONTROL_FONT_CAP)
  const large = scale > 1
  const rowHeight = large ? Math.round(ROW_LARGE * scale) : ROW
  const [list, setList] = useState<Loaded | null | 'failed'>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const busy = useRef(false)

  const fetchFirst = useCallback(() => {
    apiClient
      .getReceivedWaves(eventId, null)
      .then((r) => {
        if (!r.success || !isWavesPage(r.data)) return setList('failed')
        const crewWaves = r.data.crewWaves ?? []
        setList({ ...r.data, crewWaves, crewTotal: r.data.crewTotal ?? crewWaves.length, answeredBefore: new Set(crewWaves.filter((c) => c.wavedBack).map((c) => c.crewId)) })
      })
      .catch((e) => {
        Logger.warn('match', 'waved-at-you list failed', { error: e })
        setList('failed')
      })
  }, [eventId])
  useEffect(fetchFirst, [fetchFirst])
  const retry = () => {
    setList(null)
    fetchFirst()
  }

  const loadMore = useCallback(async () => {
    if (busy.current || !list || list === 'failed' || !list.nextCursor) return
    busy.current = true
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const r = await apiClient.getReceivedWaves(eventId, list.nextCursor)
      if (!r.success || !isWavesPage(r.data)) throw new Error(r.error ?? 'page failed')
      const next = r.data
      setList((prev) => (prev && prev !== 'failed' ? { ...prev, open: next.open, total: next.total, nextCursor: next.nextCursor, waves: [...prev.waves, ...next.waves.filter((w) => !prev.waves.some((p) => p.userId === w.userId))] } : prev))
    } catch (e) {
      Logger.warn('match', 'waved-at-you page failed', { error: e })
      setMoreFailed(true)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }, [eventId, list])

  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
  const answer = async (w: AnyWave) => {
    setSending(waveId(w))
    const result = await onWaveBack(w)
    setSending(null)
    if (result === 'gone') return setGone((prev) => new Set([...prev, waveId(w)]))
    if (result !== 'done') return
    const back = <T extends AnyWave>(x: T): T => (waveId(x) === waveId(w) ? { ...x, wavedBack: true } : x)
    setList((prev) => (prev && prev !== 'failed' ? { ...prev, waves: prev.waves.map(back), crewWaves: prev.crewWaves.map(back) } : prev))
  }
  const remove = (w: AnyWave) =>
    setList((prev) => {
      if (!prev || prev === 'failed') return prev
      const without = <T extends AnyWave>(xs: T[]) => xs.filter((x) => waveId(x) !== waveId(w))
      if (isCrewWave(w)) return { ...prev, crewTotal: Math.max(0, prev.crewTotal - 1), crewWaves: without(prev.crewWaves) }
      return { ...prev, total: Math.max(0, prev.total - 1), waves: without(prev.waves) }
    })

  const line = (text: string) => <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, { color: secondary }]}>{text}</Text>
  if (list === null) return line('Loading…')
  if (list === 'failed')
    return (
      <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Who waved didn’t load — try again" hitSlop={minTarget()}>
        {line('Who waved didn’t load — try again')}
      </Pressable>
    )
  const rows = listRows(list, list.answeredBefore)
  const total = list.total + list.crewTotal
  const listHeight = Math.min(Math.max(rows.length, 1) * rowHeight + (loadingMore || moreFailed ? ROW : 0), Math.round(windowHeight * LIST_SHARE))
  return (
    <View style={styles.wrap}>
      <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={`Waved at you, ${total}`}>
        <Title family={FONT_FAMILY.brand[700]} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={styles.ink}>
          Waved at you
        </Title>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), { color: secondary }]}>
          {total}
        </Text>
      </View>
      {rows.length === 0 ? (
        line('No waves waiting.')
      ) : (
        <FlatList
          testID="waved-list"
          data={rows}
          extraData={[sending, gone]}
          keyExtractor={waveId}
          style={{ height: listHeight }}
          nestedScrollEnabled
          getItemLayout={(_d, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
          initialNumToRender={FIRST_ROWS}
          windowSize={7}
          removeClippedSubviews
          onEndReachedThreshold={1.5}
          onEndReached={() => void loadMore()}
          ListFooterComponent={<PagedFooter loading={loadingMore} failed={moreFailed} onRetry={() => void loadMore()} testID="waved-list-more" />}
          ListFooterComponentStyle={styles.foot}
          renderItem={({ item: w }) => {
            const id = waveId(w)
            const name = waveName(w)
            const left = gone.has(id)
            const answerable = list.open && !w.wavedBack && !left
            const ago = isCrewWave(w) ? `Crew · ${wavedAgoLine(w.wavedAt, now)}` : wavedAgoLine(w.wavedAt, now)
            const spoken = left ? GONE : `${isCrewWave(w) ? 'a crew, ' : ''}${wavedAtYouLine(w.wavedAt, now)}${w.wavedBack ? ', waved back' : ''}`
            const safety = () => {
              H.longPress()
              onSafety(w, () => remove(w))
            }
            return (
              <Pressable
                testID={`waved-row-${id}`}
                onLongPress={safety}
                accessible
                accessibilityLabel={`${name}, ${spoken}`}
                accessibilityActions={[...(answerable ? [{ name: 'waveBack', label: 'Wave back' }] : []), { name: 'block', label: `Block or report ${name}` }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'block') return safety()
                  if (e.nativeEvent.actionName === 'waveBack' && sending !== id) void answer(w)
                }}
                style={[styles.row, { height: rowHeight }]}
              >
                <WaveFace size={FACE} wave={w} />
                <View style={styles.text}>
                  <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
                    {name}
                  </Text>
                  <Text numberOfLines={large ? 2 : 1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), { color: secondary }]}>
                    {left ? GONE : ago}
                  </Text>
                </View>
                {answerable || sending === id ? (
                  <Button
                    kind="lit"
                    size="pill"
                    icon="hand"
                    label="Wave back"
                    leading={sending === id ? <WavingHand size={ICON.inline} /> : undefined}
                    pressHaptic={sending === id ? false : H.select}
                    onPress={() => {
                      if (sending !== id) void answer(w)
                    }}
                    accessibilityLabel={`Wave back at ${name}`}
                    style={styles.pill}
                    testID={`waved-row-${id}-wave`}
                  />
                ) : w.wavedBack ? (
                  // ✓ Waved is still: the neutral, disabled (no Wave again), as the person page's.
                  <Button kind="secondary" size="pill" icon="check" label="Waved" disabled accessibilityLabel={`Waved at ${name}`} style={styles.pill} />
                ) : null}
              </Pressable>
            )
          }}
        />
      )}
      {list.open ? null : line('This room has closed.')}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  ink: { color: COLOR.textPrimary },
  centre: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  // A pill starts at its row's top by default; the row is taller than it.
  pill: { alignSelf: 'center' },
  foot: { minHeight: ROW, justifyContent: 'center' },
})
