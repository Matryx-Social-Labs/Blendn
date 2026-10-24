import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { InviteRow } from '../../components/crews/InviteRow'
import { RowsCard } from '../../components/crews/RowsCard'
import { Button } from '../../components/ds/Button'
import { CrewRow } from '../../components/ds/CrewCard'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { font, HueProvider, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { emptyOut, fadeIn, riseIn } from '../../components/board/boardMotion'
import { useSkeletonCrossfade } from '../../components/motion/useSkeletonCrossfade'
import { SkeletonBlock } from '../../components/Skeleton'
import { useToastDock } from '../../components/toastDock'
import { type Crew, type CrewInvite } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { crewRowSub, inviteRows } from '../../lib/crewsScreens'
import { COLOR, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'
import { ONBOARDING_ROUTES } from '../../lib/onboarding'
import { useTopBarState } from '../../lib/useTopBarState'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; crews: Crew[]; invites: CrewInvite[]; invitesTotal: number; invitesCursor: string | null }
  /** The set-up and age gate (403): the server's sentence, and the way through it. */
  | { kind: 'gate'; line: string }
  | { kind: 'failed' }

/** flow10.js `crews`: the invites card, the crews card and the footnote sit 24 apart. */
const SECTION_GAP = SPACE.xl
/** The docked Make a crew sits this far above the bottom inset (the frame's `bottom + 24`). */
const DOCK_GAP = SPACE.xl
/** How long the first item's rise is the arrival: longer than `base` and the exit together. */
const FIRST_ITEM_MS = 600
/** Three rows of the card, so the list does not jump when it lands. */
const SKELETON_ROWS = 3
/** D-L18: what the footnote means, in one plain sentence. */
export const FOOTNOTE = 'Where your crew is shows once you’ve checked in somewhere.'

/**
 * Your crews, and the invites waiting for you (Flow 10 · 10.1).
 *
 * Invites first (the friend's first name; See invite opens the invite and
 * never joins), then your crews as rows. No presence here: the server serves a
 * crew's presence only to someone checked in. Make a crew is the docked
 * primary. A lapsed invite dims and says Expired.
 */
function CrewsScreenContent() {
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  // The docked button's measured height: at the accessibility sizes it is taller than `SIZE.primary`, and the footnote ran under it (D-M11).
  const [dockHeight, setDockHeight] = useState<number>(SIZE.primary)
  // The list fades in over its skeleton only if one was drawn (a wait under 300 ms shows no skeleton).
  const arrive = useSkeletonCrossfade(load.kind === 'loading')
  const reduceMotion = useReducedMotion()
  // The bar's glass and title follow the scroll (DS #30), a render per crossing and never per frame.
  const bar = useTopBarState()
  /*
   * #47, empty to first item: the first crew (or invite) is why the empty state leaves, so it fades over `quick` with an 8 pt
   * drop as the list rises in (Reduce Motion: a crossfade, no drop). Only that step plays: a first load, a refresh and a list
   * that stays a list never do. State adjusted in render, so the list that replaces the empty one is the one that rises.
   */
  const isEmpty = load.kind === 'ready' && load.crews.length === 0 && load.invites.length === 0
  const [wasEmpty, setWasEmpty] = useState(false)
  const [firstItem, setFirstItem] = useState(false)
  if (isEmpty !== wasEmpty) {
    setWasEmpty(isEmpty)
    setFirstItem(wasEmpty && load.kind === 'ready' && !isEmpty)
  }
  // The rise belongs to that one arrival: a list that mounts again later (after a failed refresh) does not replay it.
  useEffect(() => {
    if (!firstItem) return
    const timer = setTimeout(() => setFirstItem(false), FIRST_ITEM_MS)
    return () => clearTimeout(timer)
  }, [firstItem])

  const read = useCallback(async () => {
    const result = await crewsApi.myCrews()
    if (result.success && result.data) {
      const { crews, invites, invitesPagination } = result.data
      setLoad({ kind: 'ready', crews, invites, invitesTotal: invitesPagination?.totalCount ?? invites.length, invitesCursor: invitesPagination?.hasMore ? invitesPagination.nextCursor : null })
      setMoreFailed(false)
    }
    else if (result.errorCode === 'FORBIDDEN') setLoad({ kind: 'gate', line: result.error ?? '' })
    // A failed refresh keeps the list it had: an empty one would say "no crews" about a network error.
    else setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'failed' }))
  }, [])

  // On focus: a crew you just left or made has to show as it is now.
  useFocusEffect(
    useCallback(() => {
      void read()
    }, [read])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await read()
    setRefreshing(false)
  }

  /** The next page of invites, onto the ones shown; a failure keeps them and offers the retry. */
  const moreInvites = async () => {
    if (load.kind !== 'ready' || !load.invitesCursor || loadingMore) return
    setLoadingMore(true)
    setMoreFailed(false)
    const result = await crewsApi.myCrews(load.invitesCursor)
    setLoadingMore(false)
    if (!result.success || !result.data) return setMoreFailed(true)
    const page = result.data.invitesPagination
    setLoad((now) => {
      if (now.kind !== 'ready') return now
      const seen = new Set(now.invites.map((i) => i.crewId))
      return { ...now, invites: [...now.invites, ...result.data!.invites.filter((i) => !seen.has(i.crewId))], invitesCursor: page?.hasMore ? page.nextCursor : null, invitesTotal: page?.totalCount ?? now.invitesTotal }
    })
  }

  const openNew = () => router.push('/crews/new')
  const seeInvite = (crewId: string) => router.push({ pathname: '/crews/invite/[crewId]', params: { crewId } })

  let body: ReactNode
  if (load.kind === 'loading') {
    body = <CrewsSkeleton />
  } else if (load.kind === 'failed') {
    body = (
      <StateScreen
        icon="cloud-off"
        title="Your crews didn’t load"
        body="Check your connection and try again."
        actions={[{ label: 'Try again', onPress: () => void onRefresh(), loading: refreshing }]}
        testID="crews-failed"
      />
    )
  } else if (load.kind === 'gate') {
    body = (
      <StateScreen
        icon="users"
        title="Not yet"
        body={load.line}
        actions={[{ label: 'Finish setting up', onPress: () => router.push(ONBOARDING_ROUTES.basics as never) }]}
        testID="crews-gate"
      />
    )
  } else if (!load.crews.length && !load.invites.length) {
    body = (
      <Animated.View exiting={emptyOut(reduceMotion)}>
        <StateScreen
          icon="users"
          title="Go out together. Meet other crews."
          body="Make a crew from your friends. When two of you are at the same night, the Room shows you as one."
          actions={[{ label: 'Make a crew', kind: 'primary', onPress: openNew }]}
          testID="crews-empty"
        />
      </Animated.View>
    )
  } else {
    const rows = inviteRows(load.invites)
    body = (
      <Animated.View entering={firstItem ? (reduceMotion ? fadeIn(0) : riseIn(0)) : arrive} style={styles.sections}>
        {rows.length ? (
          <View style={styles.section}>
            <SectionHeader title="Invites" count={load.invitesTotal} />
            <RowsCard testID="crews-invites">
              {rows.map((row) => (
                <InviteRow key={row.invite.crewId} row={row} onSee={() => seeInvite(row.invite.crewId)} />
              ))}
            </RowsCard>
            {load.invitesCursor ? (
              <Button
                kind="secondary"
                size="md"
                label={moreFailed ? 'Couldn’t load more · Try again' : 'Show more invites'}
                loading={loadingMore}
                onPress={() => void moreInvites()}
                testID="crews-more-invites"
              />
            ) : null}
          </View>
        ) : null}
        {load.crews.length ? (
          <View style={styles.section}>
            <SectionHeader title="Your crews" count={load.crews.length} />
            <RowsCard testID="crews-list">
              {load.crews.map((crew) => (
                <CrewRow
                  key={crew.crewId}
                  name={crew.name}
                  emblemSeed={crew.emblemSeed}
                  size={crew.size}
                  sub={crewRowSub(crew.size)}
                  onPress={() => router.push({ pathname: '/crews/[crewId]', params: { crewId: crew.crewId } })}
                />
              ))}
            </RowsCard>
            <Text style={[font('meta', bold), styles.footnote]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} testID="crews-footnote">
              {FOOTNOTE}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    )
  }

  // The dock is a crew screen's one action once there is a list to put a crew in.
  const docked = load.kind === 'ready' && (load.crews.length > 0 || load.invites.length > 0)
  // The Android snackbar stands above the docked button (the toast adds the bottom inset itself).
  useToastDock(docked ? dockHeight + DOCK_GAP : 0)

  return (
    <View style={styles.container}>
      <TopBar title="Crews" state={bar.state} onBack={() => router.back()} testID="crews-top" />
      <ScrollView
        testID="crews-scroll"
        {...bar.scrollProps}
        contentContainerStyle={[
          styles.content,
          load.kind === 'ready' ? null : styles.centred,
          docked && { paddingBottom: dockHeight + DOCK_GAP * 2 + insets.bottom },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
      {docked ? (
        <View pointerEvents="box-none" style={[styles.dock, { bottom: insets.bottom + DOCK_GAP }]} onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)} testID="crews-dock">
          <Button label="Make a crew" icon="plus" onPress={openNew} testID="crews-make" />
        </View>
      ) : null}
    </View>
  )
}

function CrewsSkeleton() {
  return (
    <View style={styles.sections} accessibilityLabel="Loading your crews">
      <SkeletonBlock width="100%" height={(SIZE.primary + SPACE.sm) * SKELETON_ROWS} borderRadius={RADIUS.sheet} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR.ink },
  content: { flexGrow: 1, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm, paddingBottom: SPACE.xxl },
  centred: { justifyContent: 'center' },
  sections: { gap: SECTION_GAP },
  section: { gap: SPACE.md },
  footnote: { color: COLOR.textTertiary, paddingHorizontal: SPACE.xs },
  dock: { position: 'absolute', left: SPACE.gutter, right: SPACE.gutter },
})

/** Rose world: one hue on this screen (`HueProvider`). */
export default function CrewsScreen() {
  return (
    <HueProvider value="rose">
      <CrewsScreenContent />
    </HueProvider>
  )
}
