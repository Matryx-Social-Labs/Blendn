import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import {
  Dimensions,
  Image as RNImage,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PulseTopBar, TOP_BAR_HEIGHT } from '../../components/pulse/PulseTopBar'
import { SceneHero } from '../../components/scene/SceneHero'
import { SceneLightbox } from '../../components/scene/SceneLightbox'
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
  SCENE_CTA_HEIGHT,
  SCENE_CTA_INSET,
  SCENE_PADDING_HORIZONTAL,
  SCENE_SECTION_GAP,
} from '../../components/scene/SceneSections'
import { highlightEntities } from '../../lib/entityHighlight'
import { heroPillLabel } from '../../lib/scarcity'
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
 * A bundled asset resolved to a URI.
 *
 * `FeedMediaItem.posterUrl` is a `string`, because in the real app every poster
 * comes from `event_media` over the network. `require()` returns an asset id,
 * and `{ uri: <number> }` renders nothing — so it is resolved here rather than
 * widening the type of the thing the whole feed depends on for one fixture.
 */
const POSTER_URI =
  RNImage.resolveAssetSource(require('../../assets/fixtures/sample-clip-poster.jpg')).uri

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
    /*
     * The clip `seed-qa.ts` puts on staging — the same one the Pulse cards
     * play, so the harness and the real feed cannot disagree about what a
     * video looks like here.
     *
     * Verified rather than assumed: 200, `video/mp4`, H.264 High, and `moov`
     * at byte 36 — faststart, which `docs/MEDIA.md` calls non-optional. Three
     * other samples were tried first and every one failed *silently*, leaving
     * the hero on a still with nothing to say why: Google's
     * gtv-videos-bucket clips now 403, `samplelib` 301-redirects to an HTML
     * page, and `filesamples` and `media.w3` both carry `moov` at the end.
     */
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    /*
     * The clip's **own** opening frame, not an unrelated picture.
     *
     * This pointed at a random photograph, so swiping to the clip showed one
     * image and then visibly swapped to another the instant the player
     * decoded — which is exactly the fault `lib/video-poster.ts` was written
     * to remove for real uploads. Fixing the pipeline and leaving the fixture
     * mismatched meant the harness kept demonstrating the bug.
     *
     * Extracted at 0.1s with ffmpeg from the same clip `seed-qa.ts` seeds, so
     * the handoff here is the handoff a correctly-uploaded event gets.
     */
    posterUrl: POSTER_URI,
  },
  { kind: 'image', url: 'https://picsum.photos/seed/scene-b/1200/1800' },
  { kind: 'image', url: 'https://picsum.photos/seed/scene-c/1200/1800' },
]

/*
 * The gallery is the same playlist the hero shows.
 *
 * One set of media, two presentations — the hero is the teaser and the rail is
 * the index of it. Giving them different lists would mean an organiser's third
 * photograph could appear in one and not the other with nothing to explain it.
 */
const GALLERY = PLAYLIST

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
  const [lightbox, setLightbox] = useState<number | null>(null)

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
        /*
          Room for the floating CTA, so the last section is reachable rather
          than parked underneath it. Anything pinned over a scroll has to pay
          for its own height here or it silently eats the end of the content.
        */
        contentContainerStyle={{
          paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + SCENE_CTA_HEIGHT + 24,
        }}
      >
        <SceneHero
          playlist={PLAYLIST}
          source={{ uri: 'https://picsum.photos/seed/thescene/1200/1800' }}
          title="The Scene"
          dateLabel="October 24, 2026"
          timeLabel="21:00 — Late"
          scarcity={heroPillLabel({ doorPolicy: 'open', maxCapacity: 140, currentCapacity: 132 })}
          onPressMedia={(i) => setLightbox(i)}
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

          <SceneGallery items={GALLERY} onOpen={(i) => setLightbox(i)} />

          <SceneAttendees count={124} seed="the-scene" />

          <SceneLocationCard
            venue="The Obsidian Vault"
            area="Arts District, Downtown"
            map={<SceneMap latitude={12.9716} longitude={77.5946} width={SCREEN_W - 24} />}
          />

          {/*
            Drawn here and *not* on the real screen: nothing populates amenities
            yet. Rendering the fixture is how the frame stays reviewable without
            the screen asserting two facts it does not have.
          */}
          <View style={styles.amenities}>
            {/* Frame `1141:4919`: a martini glass — Material `local_bar`. */}
            <SceneAmenity icon="local-bar" title="Open Bar" subtitle="Premium Spirits" color="#F79EFF" />
            {/* Frame `1141:4925`: a segmented wheel — Material `camera`. */}
            <SceneAmenity icon="camera" title="Pro Photo" subtitle="Digital Gallery" color="#FF6D8D" />
          </View>

        </View>
      </ScrollView>

      {/*
        Outside the ScrollView, as frame `1227:2903` has it — the node is a
        sibling of `Main`, not a child, and is named "Floating CTA".

        `box-none` so the gap either side of the pill still scrolls the page
        underneath; only the pill itself takes touches.
      */}
      <View
        style={[styles.ctaDock, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}
        pointerEvents="box-none"
      >
        <SceneCTA
          label="Join the Experience"
          icon={<Ionicons name="radio-outline" size={40} color={EMBER.textPrimary} />}
        />
      </View>

      <SceneLightbox
        items={GALLERY}
        initialIndex={lightbox ?? 0}
        visible={lightbox !== null}
        onClose={() => setLightbox(null)}
      />
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
  ctaDock: {
    position: 'absolute',
    left: SCENE_CTA_INSET,
    right: SCENE_CTA_INSET,
    height: SCENE_CTA_HEIGHT,
    justifyContent: 'center',
  },
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
