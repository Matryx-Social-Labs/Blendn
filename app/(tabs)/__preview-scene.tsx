import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { SceneHero } from '../../components/scene/SceneHero'
import {
  SceneAmenity,
  SceneBodyAccent,
  SceneGallery,
  SceneMap,
  SceneAttendees,
  SceneBody,
  SceneCTA,
  SceneHeading,
  SceneLocationCard,
  SCENE_PADDING_HORIZONTAL,
  SCENE_SECTION_GAP,
} from '../../components/scene/SceneSections'
import { highlightEntities } from '../../lib/entityHighlight'
import type { FeedMediaItem } from '../../lib/feedMedia'
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
  'through the void. The Scene takes over The Obsidian Vault for one night.'

/** What the payload already knows: title, venue, city, category. */
const ENTITIES = ['The Scene', 'The Obsidian Vault', 'Bengaluru', 'Nightlife']
const SCREEN_W = Dimensions.get('window').width

/*
 * A clip first, then stills — so the harness exercises the video path.
 *
 * Every still carries the same poster rule the feed uses. The clip is Google's
 * public sample; `feedPlaylist` in the real screen builds this from
 * `event_media`.
 */
const PLAYLIST: FeedMediaItem[] = [
  {
    kind: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    posterUrl: 'https://picsum.photos/seed/thescene/1200/1800',
  },
  { kind: 'image', url: 'https://picsum.photos/seed/scene-b/1200/1800' },
  { kind: 'image', url: 'https://picsum.photos/seed/scene-c/1200/1800' },
]

const GALLERY = [
  'https://picsum.photos/seed/g1/600/600',
  'https://picsum.photos/seed/g2/600/600',
  'https://picsum.photos/seed/g3/600/600',
  'https://picsum.photos/seed/g4/600/600',
]

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
      {/*
        The same bar as the Pulse, not a second one that looks like it.

        The Scene's header (`1141:4930`) and the Pulse's (`1141:4819`) are the
        same component in the design — same 64pt height, same 80% #0F0E0E, same
        12pt backdrop blur, same accent wordmark at x=24. Building a lookalike
        here would be two things to keep in sync forever, and they would drift
        the first time one of them was touched.
      */}
      <PulseTopBar
        leading={<SceneBarButton icon="chevron-back" label="Back" />}
        actions={
          <>
            <SceneBarButton icon="heart-outline" label="Save this event" />
            <SceneBarButton icon="share-outline" label="Share" />
          </>
        }
      />
      <ScrollView
        contentOffset={{ x: 0, y: offset }}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 48 }}
      >
        <SceneHero
          playlist={PLAYLIST}
          source={{ uri: 'https://picsum.photos/seed/thescene/1200/1800' }}
          title="The Scene"
          dateLabel="October 24, 2026"
          timeLabel="21:00 — Late"
          limited
        />

        <View style={styles.content}>
          <View style={styles.section}>
            <SceneHeading>The Experience</SceneHeading>
            {/*
              The frame accents the event's own name mid-paragraph. Done by
              exact match against entities the payload already carries, not by a
              model — see `lib/entityHighlight.ts` for why that is the right
              tool and where a real one would go.
            */}
            <SceneBody>
              {highlightEntities(DESCRIPTION, ENTITIES).map((seg, i) =>
                seg.entity ? (
                  <SceneBodyAccent key={i}>{seg.text}</SceneBodyAccent>
                ) : (
                  seg.text
                ),
              )}
            </SceneBody>
          </View>

          <SceneAttendees count={124} seed="the-scene" />

          <SceneLocationCard
            venue="The Obsidian Vault"
            area="Arts District, Downtown"
            map={<SceneMap latitude={12.9716} longitude={77.5946} width={SCREEN_W - 24} />}
          />

          <SceneGallery photos={GALLERY} onOpen={() => {}} />

          {/*
            Drawn here and *not* on the real screen: nothing populates amenities
            yet. Rendering the fixture is how the frame stays reviewable without
            the screen asserting two facts it does not have.
          */}
          <View style={styles.amenities}>
            {/* Frame `1141:4919`: a martini glass — Material `local_bar`. */}
            <SceneAmenity icon="local-bar" title="Open Bar" subtitle="Premium Spirits" />
            {/* Frame `1141:4925`: a segmented wheel — Material `camera`. */}
            <SceneAmenity icon="camera" title="Pro Photo" subtitle="Digital Gallery" />
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

/**
 * A control in the top bar.
 *
 * 36pt is below the 44pt minimum on its own, so the hit area is expanded rather
 * than the circle — the frame's bar is 64 tall and a 44pt disc in it leaves no
 * air. `hitSlop` is the standard way to keep the target honest without the
 * drawing growing to match.
 */
function SceneBarButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={barStyles.button}
    >
      <Ionicons name={icon} size={20} color={active ? EMBER.accent : EMBER.textPrimary} />
    </Pressable>
  )
}

const barStyles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
})
