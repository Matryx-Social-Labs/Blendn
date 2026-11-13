import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { apiClient, type ReceivedWave } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { Logger } from '../../lib/logger'
import { isWavesPage, wavedAtYouLine } from '../../lib/receivedWaves'
import { Avatar } from '../ds/Avatar'
import { CONTROL_FONT_CAP, font, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { PagedFooter } from '../friends/PagedFooter'
import { WaveBackPill } from './WaveBackPill'

/** A row: the 32 face, the name and "Waved at you · 4 min" (board 03 See all). */
const ROW = 60
const FACE = 32
/** The list's share of the screen inside the tall sheet; past that it scrolls (as the crew friend picker does). */
const LIST_SHARE = 0.62
const FIRST_ROWS = 12

type Loaded = { open: boolean; total: number; waves: ReceivedWave[]; nextCursor: string | null }

/**
 * See all (board 03 S-A): every wave to you in a room, newest first, 20 a page from the server, in a windowed list with
 * the exact count in the header. Each row answers in place: Wave back, the hand while it goes, then ✓ Waved (a wave back
 * is always a mutual, so the moment follows). Holding a row offers Block and Report; a block takes the row off. A closed
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
  /** Resolves true once the server stored it. */
  onWaveBack: (wave: ReceivedWave) => Promise<boolean>
  /** Block or Report; `removed` takes the row off the list. */
  onSafety: (wave: ReceivedWave, removed: () => void) => void
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const windowHeight = useWindowDimensions().height
  const [list, setList] = useState<Loaded | null | 'failed'>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const busy = useRef(false)

  const fetchFirst = useCallback(() => {
    apiClient
      .getReceivedWaves(eventId, null)
      .then((r) => setList(r.success && isWavesPage(r.data) ? r.data : 'failed'))
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
      setList((prev) => (prev && prev !== 'failed' ? { ...next, waves: [...prev.waves, ...next.waves.filter((w) => !prev.waves.some((p) => p.userId === w.userId))] } : prev))
    } catch (e) {
      Logger.warn('match', 'waved-at-you page failed', { error: e })
      setMoreFailed(true)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }, [eventId, list])

  const answer = async (w: ReceivedWave) => {
    setSending(w.userId)
    const ok = await onWaveBack(w)
    setSending(null)
    if (ok) setList((prev) => (prev && prev !== 'failed' ? { ...prev, waves: prev.waves.map((x) => (x.userId === w.userId ? { ...x, wavedBack: true } : x)) } : prev))
  }
  const remove = (w: ReceivedWave) =>
    setList((prev) => (prev && prev !== 'failed' ? { ...prev, total: Math.max(0, prev.total - 1), waves: prev.waves.filter((x) => x.userId !== w.userId) } : prev))

  const line = (text: string) => <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, { color: secondary }]}>{text}</Text>
  if (list === null) return line('Loading…')
  if (list === 'failed')
    return (
      <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Who waved didn’t load — try again" hitSlop={minTarget()}>
        {line('Who waved didn’t load — try again')}
      </Pressable>
    )
  const listHeight = Math.min(Math.max(list.waves.length, 1) * ROW + (loadingMore || moreFailed ? ROW : 0), Math.round(windowHeight * LIST_SHARE))
  return (
    <View style={styles.wrap}>
      <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={`Waved at you, ${list.total}`}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('title', bold, FONT_FAMILY.brand[700]), styles.ink]}>
          Waved at you
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.mono[500]), { color: secondary }]}>
          {list.total}
        </Text>
      </View>
      {list.waves.length === 0 ? (
        line('No waves waiting.')
      ) : (
        <FlatList
          testID="waved-list"
          data={list.waves}
          extraData={sending}
          keyExtractor={(w) => w.userId}
          style={{ height: listHeight }}
          nestedScrollEnabled
          getItemLayout={(_d, index) => ({ length: ROW, offset: ROW * index, index })}
          initialNumToRender={FIRST_ROWS}
          windowSize={7}
          removeClippedSubviews
          onEndReachedThreshold={1.5}
          onEndReached={() => void loadMore()}
          ListFooterComponent={<PagedFooter loading={loadingMore} failed={moreFailed} onRetry={() => void loadMore()} testID="waved-list-more" />}
          ListFooterComponentStyle={styles.foot}
          renderItem={({ item: w }) => {
            const answerable = list.open && !w.wavedBack
            const safety = () => {
              H.longPress()
              onSafety(w, () => remove(w))
            }
            return (
              <Pressable
                testID={`waved-row-${w.userId}`}
                onLongPress={safety}
                accessible
                accessibilityLabel={`${w.displayName}, ${wavedAtYouLine(w.wavedAt, now)}${w.wavedBack ? ', waved back' : ''}`}
                accessibilityActions={[...(answerable ? [{ name: 'waveBack', label: 'Wave back' }] : []), { name: 'block', label: `Block or report ${w.displayName}` }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'block') return safety()
                  if (e.nativeEvent.actionName === 'waveBack' && sending !== w.userId) void answer(w)
                }}
                style={styles.row}
              >
                <Avatar size={FACE} kind="creature" pseudonym={w.displayName} />
                <View style={styles.text}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>
                    {w.displayName}
                  </Text>
                  <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('note', bold), { color: secondary }]}>
                    {wavedAtYouLine(w.wavedAt, now)}
                  </Text>
                </View>
                {answerable || sending === w.userId ? (
                  <WaveBackPill name={w.displayName} state={sending === w.userId ? 'sending' : 'ready'} onPress={() => void answer(w)} testID={`waved-row-${w.userId}-wave`} />
                ) : w.wavedBack ? (
                  <WaveBackPill name={w.displayName} state="waved" />
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
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  foot: { minHeight: ROW, justifyContent: 'center' },
})
