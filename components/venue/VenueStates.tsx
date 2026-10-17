import { StyleSheet, useWindowDimensions, View } from 'react-native'

import { StateScreen, type StateAction } from '../ds/StateScreen'
import { COLOR, RADIUS, SPACE } from '../../lib/design/tokens'
import type { VenueGate } from '../../lib/venuePage'
import { VENUE_HERO_HEIGHT } from './VenueHero'

const TITLE_LINE = { width: 200, height: 30 }
const META_LINE = { width: 260, height: 20 }
const TILE_HEIGHT = 76
const BOARD_ROW = 64
/** The state sits a third of the way down (the frame: 300 of 874). */
const GATE_TOP = 0.34

/**
 * Loading (R3-D3 3.3): the page at its real geometry, static. Nothing loops:
 * a hero, the name and its line, four tiles and the board row.
 */
export function VenueSkeleton() {
  return (
    <View accessibilityLabel="Loading the place" accessibilityState={{ busy: true }} testID="venue-skeleton">
      <View style={[styles.block, styles.hero]} />
      <View style={styles.body}>
        <View style={[styles.block, TITLE_LINE, styles.line]} />
        <View style={[styles.block, META_LINE, styles.line]} />
        <View style={styles.tiles}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.block, styles.tile]} />
          ))}
        </View>
        <View style={[styles.block, styles.board]} />
      </View>
    </View>
  )
}

/**
 * The page refused or failed (R3-D3 3.3, Flow 11 11-2): a state, not a toast.
 * Try again only where a retry could change the answer; Back always.
 */
export function VenueGateScreen({ gate, onRetry, onBack }: { gate: VenueGate; onRetry: () => void; onBack: () => void }) {
  const { height } = useWindowDimensions()
  const back: StateAction = { label: 'Go back', kind: gate.kind === 'failed' ? 'tertiary' : 'secondary', onPress: onBack }
  return (
    <View style={[styles.gate, { paddingTop: Math.round(height * GATE_TOP) }]} accessibilityLiveRegion="polite" testID={`venue-${gate.kind}`}>
      {gate.kind === 'refused' ? (
        <StateScreen icon={gate.icon} title={gate.title} body={gate.body} actions={[back]} />
      ) : gate.kind === 'notFound' ? (
        <StateScreen icon="map-pin-off" title="This place isn’t on Blend’n yet" actions={[back]} />
      ) : (
        <StateScreen
          icon="map-pin-off"
          title="This place didn’t load."
          body="Check your connection and try again."
          actions={[{ label: 'Try again', onPress: onRetry }, back]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { backgroundColor: COLOR.surfaceSunken },
  hero: { height: VENUE_HERO_HEIGHT },
  body: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.xl, gap: SPACE.md },
  line: { borderRadius: RADIUS.thumb },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginTop: SPACE.sm },
  tile: { flexGrow: 1, flexBasis: '40%', height: TILE_HEIGHT, borderRadius: RADIUS.rowInCard },
  board: { height: BOARD_ROW, borderRadius: RADIUS.rowInCard, marginTop: SPACE.sm },
  gate: { paddingHorizontal: SPACE.gutter },
})
