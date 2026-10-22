import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Ellipse, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg'

import { COLOR, FONT_FAMILY, MATERIAL } from '../../lib/design/tokens'
import { DiscMark } from './DiscMark'
import { ContainedCover, dateLine, placeLine, TemplateText, templateType, type ShareEvent } from './LinkPreviewCard'
import { Orbs } from './Orbs'

/**
 * Instagram's images, in their own pixels (Flow 16 · 16.3 `imageCard`): 1080
 * wide; a Story 1920 tall with the top 250 and bottom 340 kept clear for its
 * UI and the Link sticker (the frame marks both with a faint hatch). Words take
 * a TYPE role × `TEMPLATE_SCALE`, as on the OG card.
 */
export const STORY = {
  width: 1080,
  height: 1920,
  clearTop: 250,
  clearBottom: 340,
  cover: { left: 64, top: 330, side: 952, radius: 40 },
  text: { top: 1330, gap: 16 },
  going: { height: 64, side: 28, top: 8 },
  link: { left: 64, bottom: 360 },
  bloom: { inset: -200, top: 300, height: 1300 },
  hatch: { period: 20, stripe: 2 },
} as const
const SQUARE = { cover: 720, band: { side: 72, top: 760, gap: 16 }, mark: 88 } as const
const RECAP = { side: 64, top: 330, space: 40, mark: 96, tileGap: 24, tileRadius: 40, tilePad: { v: 48, h: 44 }, tileTextGap: 8, linkBottom: 380 } as const
/** The recap's orbs at half strength, the Story's bloom at 35% (the frame). */
const RECAP_ORBS = 0.5
const BLOOM_ALPHA = 0.35
const HATCH_ALPHA = 0.05
/** Two tiles a row with the gap between; an odd first tile spans the row. */
const TWO_UP = '48%'

export type RecapStat = { value: string; label: string }

export type StoryCardProps = { width: number; testID?: string } & (
  | { kind: 'story' | 'square'; event: ShareEvent; /** Default off: "Say I’m going". */ going?: boolean }
  | { kind: 'recap'; month: string; stats: RecapStat[]; /** Default off: "Show top venue". */ topVenue?: string | null }
)

/**
 * The images for Instagram (guidelines/components/StoryCard.html, Flow 16 ·
 * 16.3), drawn at any width; at 1080 wide it is the export.
 *
 * - `square` 1080: the cover on top (contained), then the date, the title
 *   and the venue, the mark beside them.
 * - `story` 1080 × 1920: the 952 cover card on a faint orange → violet bloom,
 *   the date, title and venue, and a small link line for people who skip the
 *   sticker. "I'm going" only behind its default-off toggle.
 * - `recap`: "Your September" and two or three stat tiles; no people, no
 *   dates, the top venue only behind its toggle.
 *
 * The link is copied first; the image carries the event's short URL at most,
 * never a person. An exported image: no screen reader, no haptic, no motion.
 *
 * ponytail: drawn, not exported. Turning it into a file for Instagram needs a
 * view-capture module, a native dependency, with the screen that shares it.
 */
export function StoryCard(props: StoryCardProps) {
  const { width, testID } = props
  const k = width / STORY.width
  const height = (props.kind === 'square' ? STORY.width : STORY.height) * k
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.card, { width, height }]}>
      {props.kind === 'square' ? <Square event={props.event} k={k} /> : null}
      {props.kind === 'story' ? <Story event={props.event} going={props.going} k={k} testID={testID} /> : null}
      {props.kind === 'recap' ? <Recap month={props.month} stats={props.stats} topVenue={props.topVenue} k={k} testID={testID} /> : null}
    </View>
  )
}

/** The kept-clear zones, hatched as the frame draws them, and what lies between. */
function ClearZones({ k, testID, children }: { k: number; testID?: string; children?: ReactNode }) {
  const period = STORY.hatch.period * k
  return (
    <>
      {[
        { top: 0, height: STORY.clearTop * k },
        { bottom: 0, height: STORY.clearBottom * k },
      ].map((place, i) => (
        <Svg key={i} style={[styles.zone, place]} width="100%" height={place.height}>
          <Defs>
            <Pattern id={`hatch${i}`} patternUnits="userSpaceOnUse" width={period} height={period} patternTransform="rotate(45)">
              <Rect width={STORY.hatch.stripe * k} height={period} fill={COLOR.textPrimary} opacity={HATCH_ALPHA} />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#hatch${i})`} />
        </Svg>
      ))}
      <View testID={testID && `${testID}-safe`} pointerEvents="none" style={[styles.zone, { top: STORY.clearTop * k, bottom: STORY.clearBottom * k }]} />
      {children}
    </>
  )
}

/** The Story's bloom: an orange and a violet ellipse, feathered (the frame's two radial gradients). */
function Bloom({ k }: { k: number }) {
  return (
    <Svg style={[styles.zone, { left: STORY.bloom.inset * k, right: STORY.bloom.inset * k, top: STORY.bloom.top * k, height: STORY.bloom.height * k }]} width="100%" height={STORY.bloom.height * k}>
      <Defs>
        <RadialGradient id="bloomA" cx="30%" cy="40%" r="55%">
          <Stop offset={0} stopColor={COLOR.brandOrange} stopOpacity={BLOOM_ALPHA} />
          <Stop offset={1} stopColor={COLOR.brandOrange} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="bloomB" cx="75%" cy="65%" r="55%">
          <Stop offset={0} stopColor={COLOR.brandViolet} stopOpacity={BLOOM_ALPHA} />
          <Stop offset={1} stopColor={COLOR.brandViolet} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="url(#bloomA)" />
      <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="url(#bloomB)" />
    </Svg>
  )
}

function EventText({ event, k, gap }: { event: ShareEvent; k: number; gap: number }) {
  return (
    <View style={{ gap: gap * k }}>
      <TemplateText style={[templateType('label', k, FONT_FAMILY.mono[500]), styles.orange]}>{dateLine(event.date)}</TemplateText>
      <TemplateText numberOfLines={2} style={[templateType('heading', k), styles.ink]}>
        {event.title}
      </TemplateText>
      <TemplateText style={[templateType('caption', k), styles.quiet]}>{placeLine(event)}</TemplateText>
    </View>
  )
}

function Story({ event, going, k, testID }: { event: ShareEvent; going?: boolean; k: number; testID?: string }) {
  const c = STORY.cover
  return (
    <>
      <Bloom k={k} />
      <ClearZones k={k} testID={testID}>
        <View style={[styles.coverCard, { left: c.left * k, top: c.top * k, width: c.side * k, height: c.side * k, borderRadius: c.radius * k }]}>
          {event.cover ? <ContainedCover uri={event.cover} radius={c.radius * k} /> : null}
        </View>
        <View style={[styles.text, { left: c.left * k, right: c.left * k, top: STORY.text.top * k }]}>
          <EventText event={event} k={k} gap={STORY.text.gap} />
          {going ? (
            <View style={[styles.going, { height: STORY.going.height * k, paddingHorizontal: STORY.going.side * k, borderRadius: (STORY.going.height * k) / 2, marginTop: STORY.going.top * k }]}>
              <TemplateText style={[templateType('caption', k, FONT_FAMILY.brand[700]), { color: COLOR.selectionInk }]}>I’m going</TemplateText>
            </View>
          ) : null}
        </View>
        {event.url ? (
          <TemplateText style={[templateType('caption', k, FONT_FAMILY.mono[500]), styles.link, { left: STORY.link.left * k, bottom: STORY.link.bottom * k }]}>{event.url}</TemplateText>
        ) : null}
      </ClearZones>
    </>
  )
}

function Square({ event, k }: { event: ShareEvent; k: number }) {
  const b = SQUARE.band
  return (
    <>
      <View style={[styles.squareCover, { height: SQUARE.cover * k }]}>{event.cover ? <ContainedCover uri={event.cover} /> : null}</View>
      <View style={[styles.text, { left: b.side * k, right: b.side * k, top: b.top * k }]}>
        <EventText event={event} k={k} gap={b.gap} />
      </View>
      <View style={[styles.text, { right: b.side * k, top: b.top * k }]}>
        <DiscMark height={SQUARE.mark * k} />
      </View>
    </>
  )
}

function Recap({ month, stats, topVenue, k, testID }: { month: string; stats: RecapStat[]; topVenue?: string | null; k: number; testID?: string }) {
  const tiles = topVenue ? [...stats, { value: topVenue, label: 'top venue' }] : stats
  const r = RECAP
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { opacity: RECAP_ORBS }]}>
        <Orbs set="brand" time="night" paused />
      </View>
      <ClearZones k={k} testID={testID}>
        <View style={[styles.text, { left: r.side * k, right: r.side * k, top: r.top * k, gap: r.space * k }]}>
          <View style={styles.head}>
            <TemplateText style={[templateType('title', k), styles.ink, styles.fill]}>{`Your ${month}`}</TemplateText>
            <DiscMark height={r.mark * k} />
          </View>
          <View style={[styles.tiles, { rowGap: r.tileGap * k }]}>
            {tiles.map((t, i) => (
              <View
                key={t.label}
                style={[
                  styles.tile,
                  {
                    width: tiles.length % 2 && i === 0 ? '100%' : TWO_UP,
                    borderRadius: r.tileRadius * k,
                    paddingVertical: r.tilePad.v * k,
                    paddingHorizontal: r.tilePad.h * k,
                    gap: r.tileTextGap * k,
                  },
                ]}
              >
                <TemplateText style={[/^\d/.test(t.value) ? templateType('numericDisplay', k, FONT_FAMILY.mono[700]) : templateType('title', k), styles.ink]}>{t.value}</TemplateText>
                <TemplateText style={[templateType('caption', k), styles.quiet]}>{t.label}</TemplateText>
              </View>
            ))}
          </View>
        </View>
        <TemplateText style={[templateType('caption', k, FONT_FAMILY.mono[500]), styles.link, { left: r.side * k, bottom: r.linkBottom * k }]}>blendn.app</TemplateText>
      </ClearZones>
    </>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLOR.ink, overflow: 'hidden' },
  zone: { position: 'absolute', left: 0, right: 0 },
  coverCard: { position: 'absolute', overflow: 'hidden', backgroundColor: COLOR.surface },
  text: { position: 'absolute' },
  going: { alignSelf: 'flex-start', justifyContent: 'center', backgroundColor: COLOR.selectionFill },
  link: { position: 'absolute', color: COLOR.textTertiary },
  squareCover: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: COLOR.surface },
  head: { flexDirection: 'row', alignItems: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { backgroundColor: MATERIAL.fillOnGlass },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  quiet: { color: COLOR.textSecondary },
  orange: { color: COLOR.brandOrange },
})
