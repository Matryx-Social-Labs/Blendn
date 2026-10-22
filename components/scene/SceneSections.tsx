import { useEffect, useState } from 'react'
import { Image } from 'expo-image'
import MapView, { Marker } from 'react-native-maps'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  LayoutAnimationConfig,
  ReduceMotion,
  cubicBezier,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import type { DetailBlock } from '../../lib/eventDetails'
import type { FeedMediaItem } from '../../lib/feedMedia'
import { Avatar } from '../ds/Avatar'
import { RollingNumber } from '../ds/RollingNumber'
import { SectionHeader } from '../ds/SectionHeader'
import { font, useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { fadeInFast, popIn } from '../motion/presence'
import { GradientFill } from '../ui/GradientFill'
import { Icon } from '../ui/Icon'
import { COLOR, DURATION, EASING, FONT_FAMILY, ICON, MATERIAL, RADIUS, RISE, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { DARK_MAP_STYLE, LOCATION_CARD_DELTA } from '../../lib/mapStyle'
import { printable } from '../../lib/pulseSections'
import { avatarStack } from '../../lib/pseudonymAvatar'

/*
 * The CTA's label change (#45, A78 approved in Prompt 10): the old label exits
 * up 8 pt over `quick`, the new one rises 8 pt over `base`. Reduce Motion: the
 * two crossfade in place.
 */
const changeFade = FadeIn.duration(DURATION.quick).reduceMotion(ReduceMotion.Never)
const ctaLabelIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE.list }] },
    animations: {
      opacity: withTiming(1, { duration: DURATION.base, easing: Easing.bezier(...EASING.entrance) }),
      transform: [{ translateY: withTiming(0, { duration: DURATION.base, easing: Easing.bezier(...EASING.entrance) }) }],
    },
  }
}
const ctaLabelOut = () => {
  'worklet'
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: DURATION.quick, easing: Easing.bezier(...EASING.exit) }),
      transform: [{ translateY: withTiming(-RISE.list, { duration: DURATION.quick, easing: Easing.bezier(...EASING.exit) }) }],
    },
  }
}
const ctaFadeOut = () => {
  'worklet'
  return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, { duration: DURATION.quick }) } }
}
/** The FAQ chevron's turn, as a CSS transition curve. */
const TURN_EASE = cubicBezier(...EASING.entrance)

/**
 * The Scene's body sections (Flow 3 `scene`): the experience, the organiser's details, the gallery, and the dock's
 * call to action. Presentational only: every one takes formatted strings and draws them; the screen keeps the data,
 * the permissions and the handlers. The 2 x 2 facts are the DS `AmenityGrid`, the headings its `SectionHeader`.
 */
export const SCENE_PADDING_HORIZONTAL = SPACE.gutter
export const SCENE_SECTION_GAP = SPACE.xxl

/**
 * The dock's button is the scale's primary-action height; the dock itself is `components/ds/Dock` (a glass bar with
 * the gutter on both sides), so a page pays for it by its measured height, not a constant.
 */
export const SCENE_CTA_HEIGHT = SIZE.primary

/** The CTA's icon. Sized here, not at the call site, because it sets the pill's height. */
export const SCENE_CTA_ICON = ICON.nav

/** A gallery tile. Square, and sized so a second one is partly visible. */
export const GALLERY_TILE = 160

/** The map band inside the Location card. */
export const MAP_HEIGHT = 256

/**
 * Who is putting it on, and, while it runs, how many are there right now (kept from before the redesign; the frame
 * draws neither). A still green dot beside the room's own "here now": the same mark the Room and Tonight use for live,
 * never a pulse. Nothing when it has neither, so an unhosted, unstarted event gets no empty row.
 */
export function SceneByline({ host, hereNow }: { host?: string | null; hereNow?: number | null }) {
  const bold = useBoldText()
  // Under five is not printed, the Pulse's rule: "3 here now" names whoever they are.
  const here = printable(hereNow)
  const live = here !== null
  if (!host && !live) return null
  return (
    <View style={styles.byline} testID="scene-byline">
      {host ? (
        <Text numberOfLines={1} style={[font('meta', bold), styles.secondary]}>
          By <Text style={styles.ink}>{host}</Text>
        </Text>
      ) : null}
      {live ? (
        <View style={styles.bylineLive} accessible accessibilityLabel={`${here} people here now`}>
          <View style={styles.liveDot} />
          <Text style={[font('meta', bold), styles.secondary]}>{here} here now</Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Attendees: a heading, the count rolling beside it, and a stack of creatures (kept from before the redesign).
 *
 * ## The faces are not coming back
 *
 * `GET /events` used to return real photographs of everyone who had favourited an event, to any authenticated caller
 * with no identity gate, and it was removed as a security fix (blendn-admin #229): a face is identity, and it was
 * harvestable by topic. So each disc is the DS `Avatar` creature, seeded by the event and the position, never by anyone
 * attending: "a person is here", and nothing about who. Hidden from a screen reader (unlabelled it would say "butterfly,
 * turtle, fox", confidently wrong); the count beside the heading is the message.
 *
 * The heading is a prop because the number means two different things either side of the doors: who said they are coming,
 * then who turned up.
 */
export function SceneAttendees({ count, seed, label = 'Attendees' }: { count: number; seed: string; label?: string }) {
  const bold = useBoldText()
  // Under five the number is not printed (the Pulse's rule), and neither is a stack that would count it: just the heading.
  const printed = printable(count)
  if (printed === null) {
    return (
      <View style={styles.attendeesSection} testID="scene-attendees">
        <SectionHeader title="Attendees" />
      </View>
    )
  }
  const { shown, remainder } = avatarStack(printed)
  return (
    <View style={styles.attendeesSection} testID="scene-attendees">
      <View accessible accessibilityRole="header" accessibilityLabel={`${label}, ${printed}`} style={styles.attendees}>
        <SectionHeader title={label} />
        <RollingNumber value={printed} role="numericDisplay" color={COLOR.textSecondary} />
      </View>
      {shown > 0 ? (
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: shown }, (_, i) => (
            <View key={i} style={i > 0 ? styles.overlap : undefined}>
              <Avatar kind="creature" pseudonym={`${seed}:${i}`} size={AVATAR} ring={COLOR.ink} />
            </View>
          ))}
          {remainder > 0 ? (
            <View style={[styles.more, styles.overlap]}>
              <Text style={[font('bodyStrong', bold, FONT_FAMILY.mono[700]), styles.ink]}>+{remainder}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
const AVATAR = 56

const MAP_FADE_IN = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance)).reduceMotion(ReduceMotion.Never)

/**
 * The map inside the Location card: a `MapView` with every gesture off. The SDK's loads are free and its keys are
 * restricted to this app, unlike the old Static Maps image; it stays a picture, not a map you steer (the tap belongs to
 * the card, which opens external maps). No coordinate, or 0,0 (an unset one in this schema), is a plain surface rather
 * than a broken map.
 */
export function SceneMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const hasCoords = !!latitude && !!longitude
  return (
    <View style={styles.map}>
      {hasCoords ? (
        <Animated.View style={StyleSheet.absoluteFill} entering={MAP_FADE_IN} pointerEvents="none">
          <MapView
            style={StyleSheet.absoluteFill}
            customMapStyle={DARK_MAP_STYLE}
            initialRegion={{ latitude, longitude, latitudeDelta: LOCATION_CARD_DELTA, longitudeDelta: LOCATION_CARD_DELTA }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            // Android's lite mode renders one bitmap instead of a live surface: nothing about this slot needs a live map.
            liteMode
            pointerEvents="none"
          >
            <Marker coordinate={{ latitude, longitude }} pinColor={COLOR.textPrimary} />
          </MapView>
        </Animated.View>
      ) : null}
    </View>
  )
}

/**
 * The venue card under the page's sections (kept from before the redesign; the frame's Where tile opens the same map):
 * a `surface` card at the card radius, the venue and its address over the map band. `map` is a slot, so an event with no
 * geocoded venue shows the address without an empty grey rectangle under it.
 */
export function SceneLocationCard({ venue, area, map }: { venue: string; area: string; map?: React.ReactNode }) {
  const bold = useBoldText()
  return (
    <View style={styles.locationCard} testID="scene-location">
      <View style={styles.cardBody}>
        <Text style={[font('label', bold), styles.secondary]}>LOCATION</Text>
        <Text style={[font('bodyStrong', bold), styles.ink]}>{venue}</Text>
        <View style={styles.addressRow}>
          <Icon name="map-pin" size={ICON.inline} color={COLOR.textSecondary} />
          <Text numberOfLines={2} style={[font('meta', bold), styles.secondary, styles.shrink]}>
            {area}
          </Text>
        </View>
      </View>
      {map}
    </View>
  )
}

/**
 * The prose under a heading: `body` on `textSecondary`.
 *
 * A caller with a phrase to lift (the event's own name, matched exactly) wraps it in `SceneBodyAccent`, which raises it
 * from `textSecondary` to `textPrimary`.
 */
export function SceneBody({ children }: { children: React.ReactNode }) {
  const bold = useBoldText()
  return <Text style={[font('body', bold), styles.secondary]}>{children}</Text>
}

export function SceneBodyAccent({ children }: { children: string }) {
  return <Text style={styles.ink}>{children}</Text>
}

/**
 * The sticky call to action. Frame `1227:2904`, as Flow 3's dock draws it.
 *
 * A full-width pill: the gradient while there is something still to do, 8%
 * white once it is done (A78).
 *
 * ## The price is not drawn
 *
 * The frame reads "Join the Experience  $45". There is no ticketing, no
 * payment, and everything is free — so a price here would be the interface
 * inventing a commitment the product cannot honour. The label says joining,
 * which is what actually happens.
 */
export type SceneCTAState = 'rsvp' | 'rsvpd' | 'waitlisted' | 'join' | 'going' | 'ended' | 'rate' | 'cancelled'

/**
 * What the button says, per state.
 *
 * **Capacity is deliberately absent.** `blendn-admin/docs/CHECKIN.md:39` — "Check-in does not
 * refuse at capacity" — so a full event still takes people. `max_capacity` is a
 * number the organiser watches, not a door the app keeps, and the hero pill
 * already reports it as information. A CTA that disabled itself on a full event
 * would block an interaction the product explicitly allows.
 *
 * **No state disables.** `ended` used to — "This event has ended", greyed
 * out — on the reasoning that for somebody who was not there tapping could do
 * nothing. But somebody opening a finished event is somebody looking for a
 * night out, and a dead pill in the most prominent slot told them nothing
 * about where to find one. So it offers tonight instead: the Blend'n screen,
 * which lists what is on now, nearest first.
 *
 * `rate` is the same slot for the people who *were* there: the night leaves
 * one thing to do afterwards — rate the people you met. `PLACEHOLDER_SCREENS.md`
 * asks for "an entry point after an event ends" and this is it: the same slot,
 * the same rule that its subject changes with the clock.
 *
 * ## "Blend in", not "Join the Experience"
 *
 * The frame's label is generic — it would fit any event app. The product is
 * called Blend'n *because* blending in with people in real time is the thing it
 * does, so the button is the one place the name can be a verb instead of a
 * logo. It is also shorter, which matters at 20pt beside a 40pt icon.
 *
 * `going` follows it: "You're in" is the same voice, and it reads as being
 * *inside* something rather than as a travel plan.
 */
const CTA_LABEL: Record<SceneCTAState, string> = {
  rsvp: "I’m going",
  rsvpd: "You’re going",
  // A waitlist place is not a seat: never "You're going" (A78 review).
  waitlisted: 'On the waitlist',
  join: 'Blend in',
  going: "You’re in",
  ended: "See what’s on tonight",
  rate: 'Rate who you met',
  // The organiser called it off (Flow 15 #10): one neutral line, and nothing to press.
  cancelled: 'Cancelled',
}

/**
 * The label, with the one state that depends on more than the clock: after a
 * night where nobody else checked in there is nobody to rate, so the prompt is
 * the night itself — the same words the room's recap uses.
 */
export function sceneCtaLabel(state: SceneCTAState, alone = false): string {
  return state === 'rate' && alone ? 'Rate the night' : CTA_LABEL[state]
}

/**
 * The two states before the doors open, and why the button changes at all.
 *
 * "Blend in" is a check-in, and a check-in needs the event to be **running** —
 * `pickInsideEvent` requires `start <= now` and the server re-validates it. So
 * on an event that is still two days away the button was offering the one
 * action that cannot succeed: a dead control in the most prominent position on
 * the screen, which is the same fault the centre nav button was redesigned to
 * stop having.
 *
 * Before the doors, the honest offer is the one that *is* available — saying
 * you are coming. `rsvpd` is its off-switch rather than a second control, for
 * the same reason `going` is not accompanied by a "leave" button: one slot,
 * one subject, and the state tells you which way the tap goes.
 */
const CTA_QUIET: readonly SceneCTAState[] = ['rsvpd', 'waitlisted', 'going', 'ended', 'cancelled']

/** Before the doors: the RSVP slot's state from the server's answer. */
export function rsvpCtaState(status: string | null | undefined): 'rsvp' | 'rsvpd' | 'waitlisted' {
  return status === 'going' ? 'rsvpd' : status === 'waitlisted' ? 'waitlisted' : 'rsvp'
}

/*
 * The CTA's motion (#45 as A78 settled it): a press scale; on a change the old
 * label exits up 8 pt over quick and the new one rises 8 pt over base; the
 * icon pops in when it swaps; the gradient fades to 8% white under them when
 * the state goes quiet. The width is full in every state, so nothing settles.
 *
 * Reduce Motion: the labels crossfade and nothing moves.
 */
export function SceneCTA({
  state = 'join',
  icon,
  iconKey,
  onPress,
  alone = false,
  pending = false,
}: {
  state?: SceneCTAState
  /** The request is out: a spinner in the icon's place, the label unchanged, nothing pressable (#45). The sequence runs on the answer. */
  pending?: boolean
  /** Nobody but you checked in: `rate` then asks about the night, not people. */
  alone?: boolean
  /** Drawn in the colour the pill hands it — dark on the accent fill, `textPrimary` on the quiet one. */
  icon?: (color: string) => React.ReactNode
  /** Names which glyph `icon` is drawing; a new key is what pops the new one in. */
  iconKey?: string
  onPress?: () => void
}) {
  // Only while a handler is busy; no state is a dead end.
  const disabled = !onPress || pending
  /*
   * Quiet once you have already said yes. The accent is for the thing that
   * still needs doing; a fully lit pill that only un-does something reads as
   * the primary action of the screen.
   */
  const quiet = CTA_QUIET.includes(state)
  const reduceMotion = useReducedMotion()
  // A78: gradient → 8% white over `base` when the state goes quiet; the width is already full, so nothing settles.
  const loud = useSharedValue(quiet ? 0 : 1)
  useEffect(() => {
    loud.set(withTiming(quiet ? 0 : 1, { duration: DURATION.base, easing: Easing.bezier(...EASING.gentle) }))
  }, [quiet, loud])
  const loudFill = useAnimatedStyle(() => ({ opacity: loud.get() }))
  /*
   * The label was a free string, which was survivable while this sat at the
   * bottom of a 1900pt page and most people never reached it. Pinned to the
   * screen for the whole visit it is the most-looked-at control here, and it
   * said "Join the Experience" whether or not you already had — the classic
   * "did that work?" failure, permanently in view.
   */
  return (
    /*
     * Scales on press-in, before the request goes out: that is the latency the
     * finger actually feels. No haptic here — every handler behind this button
     * already fires its own `feedback.*`, and two per tap is a buzz.
     */
    <ScalePress
      haptic={false}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: pending, selected: state === 'going' }}
      accessibilityLabel={sceneCtaLabel(state, alone)}
    >
      {/*
        Full width, the gradient while there is something still to do, 8% white
        once it is done (A78, Prompt 10): "I’m going" → "You’re going" with the
        check is one sequence, the old label up and out over quick, the new one
        in over base, the fill crossfading under them.
      */}
      <View style={[styles.ctaFill, quiet ? styles.ctaFillQuiet : styles.ctaFillLoud]}>
        {/* The to-do fill: the gradient, which fades to the 8% white under it once done (A78). */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, loudFill]}>
          <GradientFill style={StyleSheet.absoluteFill} />
        </Animated.View>
        {/* Skips the entrance on first paint; only a *change* of icon or label animates. */}
        <LayoutAnimationConfig skipEntering>
          {pending ? (
            <ActivityIndicator testID="scene-cta-pending" color={COLOR.textOnGradient} />
          ) : icon ? (
            <Animated.View key={iconKey} entering={reduceMotion ? changeFade : popIn}>
              {icon(COLOR.textOnGradient)}
            </Animated.View>
          ) : null}
          <Animated.Text
            key={state}
            entering={reduceMotion ? changeFade : ctaLabelIn}
            exiting={reduceMotion ? ctaFadeOut : ctaLabelOut}
            style={[styles.ctaLabel, styles.ctaInk]}
            numberOfLines={1}
          >
            {sceneCtaLabel(state, alone)}
          </Animated.Text>
        </LayoutAnimationConfig>
      </View>
    </ScalePress>
  )
}

/**
 * What the organiser wrote about the event, under one heading per kind.
 *
 * `event_details` has been collected by the dashboard, stored, and served on
 * this very payload since it existed — and drawn by nothing. Accessibility is
 * the field that makes this worth building rather than deleting: an organiser
 * writes "step-free entrance" and the person deciding whether they can come
 * could not see it.
 *
 * The blocks arrive already ordered and already cleaned by
 * `lib/eventDetails.ts`; this draws them and makes no decisions, so a JSON
 * column holding something unexpected is that module's problem and never
 * reaches a `<Text>`.
 *
 * Questions are expandable, and nothing else is. A FAQ is a list you scan for
 * the one that is yours, so collapsing it is the difference between a section
 * and a wall; house rules are three lines you should not have to ask for.
 */
export function SceneDetails({ blocks }: { blocks: readonly DetailBlock[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  if (!blocks.length) return null

  return (
    <View style={styles.detailGroup}>
      {blocks.map((block) => (
        <View key={block.key} style={styles.detailBlock}>
          <SectionHeader title={block.title} />

          {block.kind === 'prose' ? <SceneBody>{block.body}</SceneBody> : null}

          {block.kind === 'pairs' ? (
            <View style={styles.detailPairs}>
              {block.pairs.map((p) => (
                <View key={p.label} style={styles.detailPair}>
                  <Text style={styles.detailPairLabel}>{p.label}</Text>
                  <Text style={styles.detailPairValue}>{p.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {block.kind === 'faq'
            ? block.items.map((item) => {
                const id = `${block.key}:${item.question}`
                const isOpen = open === id
                return (
                  /*
                    A toggle, so the selection tick ScalePress fires by default
                    is the right haptic. The chevron turns rather than swapping
                    glyphs, so it reads as the same control changing state; the
                    answer fades in, and the row's height snaps (tasks/lessons.md —
                    no layout transitions). No exit fade: the height has already
                    snapped shut, so a fading answer would sit on the row below.

                    The answer is a sibling of the button, not inside it: a
                    labelled button is one VoiceOver stop that reads only its
                    label, so an answer inside it could be opened and never heard.
                  */
                  <View key={id} style={styles.detailQuestion}>
                  <ScalePress
                    pressedScale={0.98}
                    onPress={() => setOpen(isOpen ? null : id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={item.question}
                    style={styles.detailQuestionButton}
                  >
                    <View style={styles.detailQuestionRow}>
                      <Text style={styles.detailQuestionText}>{item.question}</Text>
                      <Animated.View
                        style={{
                          transform: [{ rotate: isOpen ? '180deg' : '0deg' }],
                          transitionProperty: 'transform',
                          transitionDuration: reduceMotion ? 0 : DURATION.base,
                          transitionTimingFunction: TURN_EASE,
                        }}
                      >
                        <Icon name="chevron-down" size={ICON.control} color={COLOR.textSecondary} />
                      </Animated.View>
                    </View>
                  </ScalePress>
                    {isOpen ? (
                      <Animated.Text entering={fadeInFast} style={styles.detailAnswer}>
                        {item.answer}
                      </Animated.Text>
                    ) : null}
                  </View>
                )
              })
            : null}
        </View>
      ))}
    </View>
  )
}

/**
 * The organiser's photographs, swipeable, opening full screen on tap.
 *
 * ## Not on the frame, and it should be
 *
 * `1141:4853` has no gallery. The organiser form has had a reorderable gallery
 * the whole time — it is the same `event_media` the feed card cycles — so
 * without this, everything past the first item is authored and then never
 * shown anywhere a guest looks. That is a feature with a write path and no
 * read path, which is worse than one that does not exist.
 *
 * ## A rail, not a grid
 *
 * A grid commits vertical space proportional to the count, and the count is the
 * organiser's, so a diligent one pushes the Location card off the screen. A
 * rail costs one row whatever they upload, and swiping it is the same gesture
 * as the lightbox it opens.
 *
 * Videos are excluded: the hero already plays them, and a muted autoplaying
 * tile in a horizontal rail is the thing that makes a scroll stutter. The rail
 * is stills, and `SceneHero` is motion.
 */
export function SceneGallery({
  items,
  onOpen,
}: {
  items: FeedMediaItem[]
  onOpen: (index: number) => void
}) {
  if (items.length === 0) return null
  return (
    <View style={styles.gallerySection}>
      <SectionHeader title="Gallery" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.galleryScroll}
        contentContainerStyle={styles.galleryRail}
        // Lands on a tile rather than between two, without paging the whole
        // width — the rail deliberately shows part of the next one as an
        // affordance that there is a next one.
        snapToInterval={GALLERY_TILE + SPACE.md}
        decelerationRate="fast"
      >
        {items.map((item, i) => {
          /*
           * A clip shows its **poster**, never the clip.
           *
           * A rail of muted autoplaying videos is the single most reliable way
           * to make a scroll stutter, and it would also mean several decoders
           * alive at once for tiles nobody has asked to watch. The badge says
           * there is motion behind it; the lightbox is where it plays.
           */
          const uri = item.kind === 'image' ? item.url : item.posterUrl
          return (
            <ScalePress
              key={`${item.url}-${i}`}
              haptic={false}
              onPress={() => onOpen(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={
                item.kind === 'video'
                  ? `Video ${i + 1} of ${items.length}`
                  : `Photo ${i + 1} of ${items.length}`
              }
            >
              <Image
                source={{ uri }}
                style={styles.galleryTile}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                recyclingKey={uri}
              />
              {item.kind === 'video' ? (
                <View style={styles.playBadge} pointerEvents="none">
                  <Icon name="play" size={ICON.control} color={COLOR.textPrimary} />
                </View>
              ) : null}
            </ScalePress>
          )
        })}
      </ScrollView>
    </View>
  )
}


const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },

  shrink: { flexShrink: 1 },
  byline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: SPACE.lg, rowGap: SPACE.xs },
  bylineLive: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  liveDot: { width: SPACE.sm, height: SPACE.sm, borderRadius: RADIUS.capsule, backgroundColor: COLOR.live },
  attendeesSection: { gap: SPACE.lg },
  attendees: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  overlap: { marginLeft: -SPACE.lg },
  more: { width: AVATAR, height: AVATAR, borderRadius: RADIUS.capsule, borderWidth: SPACE.xxs, borderColor: COLOR.ink, backgroundColor: COLOR.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  map: { height: MAP_HEIGHT, backgroundColor: COLOR.surfaceSunken },
  locationCard: { backgroundColor: COLOR.surface, borderRadius: RADIUS.card, overflow: 'hidden' },
  // The bottom is the gap to the map band: at 32 the two crowded, and the card read as text on a photograph.
  // design-exception: 56 gap to the map band
  cardBody: { paddingTop: SPACE.xl, paddingHorizontal: SPACE.xl, paddingBottom: 56, gap: SPACE.sm },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },

  detailGroup: { gap: SPACE.xxl },
  detailBlock: { gap: SPACE.lg },
  detailPairs: { gap: SPACE.md },
  detailPair: { gap: SPACE.xxs },
  detailPairLabel: { ...TYPE.bodyStrong, color: COLOR.textPrimary },
  detailPairValue: { ...TYPE.body, color: COLOR.textSecondary },
  // A question people are trying to tap is the wrong place to be stingy with the target.
  detailQuestion: { gap: SPACE.sm },
  detailQuestionButton: { minHeight: SIZE.control, justifyContent: 'center' },
  detailQuestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  detailQuestionText: { ...TYPE.bodyStrong, color: COLOR.textPrimary, flex: 1 },
  detailAnswer: { ...TYPE.body, color: COLOR.textSecondary, paddingBottom: SPACE.xs },

  gallerySection: { gap: SPACE.lg },
  // Bleeds past the page gutter so the rail runs to the edge, which is what says "this scrolls".
  galleryScroll: { marginHorizontal: -SCENE_PADDING_HORIZONTAL },
  galleryRail: { gap: SPACE.md, paddingHorizontal: SCENE_PADDING_HORIZONTAL },
  galleryTile: { width: GALLERY_TILE, height: GALLERY_TILE, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken },
  playBadge: {
    position: 'absolute',
    left: SPACE.md,
    bottom: SPACE.md,
    width: SIZE.tag,
    height: SIZE.tag,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.scrim,
  },

  ctaFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.md,
    // Full width (the dock's gutters stretch it): the label changes in place and the width never has to follow it.
    paddingHorizontal: SPACE.xl,
    // 15, with a 24pt icon and a 24pt line: 1 + 15 + 24 + 15 + 1 = 56, which is SCENE_CTA_HEIGHT. Change either and the dock is wrong.
    // design-exception: 15 lands the bordered pill on SIZE.primary (56)
    paddingVertical: 15,
    borderRadius: RADIUS.capsule,
    overflow: 'hidden',
    // Present in both states so the height never changes between them.
    borderWidth: 1,
  },
  // The gradient layer draws the to-do fill; the 8% white is under it in both states.
  ctaFillLoud: { backgroundColor: MATERIAL.fillOnGlass, borderColor: 'transparent' },
  ctaFillQuiet: { backgroundColor: MATERIAL.fillOnGlass, borderColor: 'transparent' },
  // TYPE.button's 24pt line is one of the terms SCENE_CTA_HEIGHT is summed from.
  ctaLabel: { ...TYPE.button },
  ctaInk: { color: COLOR.textOnGradient },
})
