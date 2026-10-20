import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { InviteRow } from '../../components/crews/InviteRow'
import { RowsCard } from '../../components/crews/RowsCard'
import { Button } from '../../components/ds/Button'
import { CrewRow } from '../../components/ds/CrewCard'
import { SectionHeader } from '../../components/ds/SectionHeader'
import { font, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { TopBar } from '../../components/ds/TopBar'
import { useSkeletonCrossfade } from '../../components/motion/useSkeletonCrossfade'
import { SkeletonBlock } from '../../components/Skeleton'
import { useToastDock } from '../../components/toastDock'
import { type Crew, type CrewInvite } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { crewRowSub, inviteRows } from '../../lib/crewsScreens'
import { COLOR, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { ONBOARDING_ROUTES } from '../../lib/onboarding'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; crews: Crew[]; invites: CrewInvite[] }
  /** The set-up and age gate (403): the server's sentence, and the way through it. */
  | { kind: 'gate'; line: string }
  | { kind: 'failed' }

/** flow10.js `crews`: the invites card, the crews card and the footnote sit 24 apart. */
const SECTION_GAP = SPACE.xl
/** The docked Make a crew sits this far above the bottom inset (the frame's `bottom + 24`). */
const DOCK_GAP = SPACE.xl
/** Three rows of the card, so the list does not jump when it lands. */
const SKELETON_ROWS = 3
const FOOTNOTE = 'Who’s where shows once you’ve checked in at a night. Crews live here and in the Banter.'

/**
 * Your crews, and the invites waiting for you (Flow 10 · 10.1).
 *
 * Invites first (the friend's first name; See invite opens the invite and
 * never joins), then your crews as rows. No presence here: the server serves a
 * crew's presence only to someone checked in. Make a crew is the docked
 * primary. A lapsed invite dims and says Expired.
 */
export default function CrewsScreen() {
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  // The list fades in over its skeleton only if one was drawn (a wait under 300 ms shows no skeleton).
  const arrive = useSkeletonCrossfade(load.kind === 'loading')

  const read = useCallback(async () => {
    const result = await crewsApi.myCrews()
    if (result.success && result.data) setLoad({ kind: 'ready', ...result.data })
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
      <StateScreen
        icon="users"
        title="Go out together. Meet other crews."
        body="Make a crew from your friends. When two of you are at the same night, the Room shows you as one."
        actions={[{ label: 'Make a crew', onPress: openNew }]}
        testID="crews-empty"
      />
    )
  } else {
    const rows = inviteRows(load.invites)
    body = (
      <Animated.View entering={arrive} style={styles.sections}>
        {rows.length ? (
          <View style={styles.section}>
            <SectionHeader title="Invites" count={rows.length} />
            <RowsCard testID="crews-invites">
              {rows.map((row) => (
                <InviteRow key={row.invite.crewId} row={row} onSee={() => seeInvite(row.invite.crewId)} />
              ))}
            </RowsCard>
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
            <Text style={[font('meta', bold), styles.footnote]}>{FOOTNOTE}</Text>
          </View>
        ) : null}
      </Animated.View>
    )
  }

  // The dock is a crew screen's one action once there is a list to put a crew in.
  const docked = load.kind === 'ready' && (load.crews.length > 0 || load.invites.length > 0)
  // The Android snackbar stands above the docked button (the toast adds the bottom inset itself).
  useToastDock(docked ? SIZE.primary + DOCK_GAP : 0)

  return (
    <View style={styles.container}>
      <TopBar title="Crews" onBack={() => router.back()} testID="crews-top" />
      <ScrollView
        testID="crews-scroll"
        contentContainerStyle={[
          styles.content,
          load.kind === 'ready' ? null : styles.centred,
          docked && { paddingBottom: SIZE.primary + DOCK_GAP * 2 + insets.bottom },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
      {docked ? (
        <View pointerEvents="box-none" style={[styles.dock, { bottom: insets.bottom + DOCK_GAP }]}>
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
