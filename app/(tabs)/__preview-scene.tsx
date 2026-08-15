import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SceneHero } from '../../components/scene/SceneHero'
import {
  SceneAmenity,
  SceneAttendees,
  SceneBody,
  SceneCTA,
  SceneHeading,
  SceneLocationCard,
  SCENE_PADDING_HORIZONTAL,
  SCENE_SECTION_GAP,
} from '../../components/scene/SceneSections'
import { EMBER } from '../../lib/theme'
import { TAB_BAR_CLEARANCE } from './_layout'

/**
 * The Scene, rendered against fixtures — frame `1141:4853`.
 *
 * Sibling of `__preview` and it exists for the same reason: the real screen is
 * behind a login, a network round trip and a staging row that has to not have
 * expired, and none of those has anything to do with whether the hero is the
 * right height. Getting to it also failed *silently* — a deep link into
 * `/event/:id` while signed out bounces to sign-in, and a screenshot of that
 * looks enough like a dark screen to be measured by mistake. It was.
 *
 * Deep-link `exp+blendn:///__preview-scene`. Dev-only, allow-listed in
 * `app/_layout.tsx` behind `__DEV__`.
 */

/*
 * Realistic length, not "Test Event 1".
 *
 * The frame's own copy runs to two paragraphs, and a short fixture would hide
 * exactly the wrapping this screen has to survive.
 */
const DESCRIPTION =
  'Step into a realm where the boundaries of digital art and physical reality ' +
  'blur. A curated audiovisual journey designed for those who seek the ' +
  'extraordinary. Immerse yourself in the "Bioluminescent Gallery", a space ' +
  'where soundwaves translate into liquid light and every movement echoes ' +
  'through the void.'

export default function ScenePreview() {
  const insets = useSafeAreaInsets()
  /*
   * `?y=1400` starts the harness scrolled.
   *
   * Screenshotting anything below the fold otherwise needs a swipe, and touch
   * events do not land on the simulator from the command line — which in
   * practice means the lower two thirds of a long screen never get looked at.
   * `contentOffset` is honoured on mount, so each section has a repeatable
   * offset that produces the same pixels every run.
   */
  const { y } = useLocalSearchParams<{ y?: string }>()
  const offset = Number(y) || 0

  return (
    <View style={styles.container}>
      <ScrollView
        contentOffset={{ x: 0, y: offset }}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 48 }}
      >
        <SceneHero
          source={{ uri: 'https://picsum.photos/seed/thescene/1200/1800' }}
          title="The Scene"
          dateLabel="October 24, 2026"
          timeLabel="21:00 — Late"
          limited
        />

        <View style={styles.content}>
          <View style={styles.section}>
            <SceneHeading>The Experience</SceneHeading>
            <SceneBody>{DESCRIPTION}</SceneBody>
          </View>

          <SceneAttendees count={124} />

          <SceneLocationCard venue="The Obsidian Vault" area="Arts District, Downtown" />

          {/*
            Drawn here and *not* on the real screen: nothing populates amenities
            yet. Rendering the fixture is how the frame stays reviewable without
            the screen asserting two facts it does not have.
          */}
          <View style={styles.amenities}>
            <SceneAmenity icon="wine-outline" title="Open Bar" subtitle="Premium Spirits" />
            <SceneAmenity icon="camera-outline" title="Pro Photo" subtitle="Digital Gallery" />
          </View>

          <SceneCTA
            label="Join the Experience"
            icon={<Ionicons name="radio-outline" size={24} color={EMBER.textPrimary} />}
          />
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: {
    paddingHorizontal: SCENE_PADDING_HORIZONTAL,
    paddingTop: 48,
    gap: SCENE_SECTION_GAP,
  },
  section: { gap: 16 },
  amenities: { flexDirection: 'row', gap: 16 },
})
