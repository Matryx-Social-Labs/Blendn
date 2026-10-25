import { Image } from 'expo-image'
import { StyleSheet, Text, View, type TextProps, type TextStyle } from 'react-native'

import { COLOR, FONT_FAMILY, RADIUS, TYPE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'
import { DiscMark } from './DiscMark'

/** An event as it may be shared: never counts, live data, who's going, or the sharer (Flow 16 rules). */
export type ShareEvent = {
  title: string
  /** The date stack: "SAT", "04", "OCT", "9:00 PM". */
  date: { day: string; num: string; month: string; time: string }
  /** The human date for the tray and the message: "Sat 4 Oct, 9 PM". */
  dateText?: string
  venue: string
  area: string
  cover?: string | null
  /** "blendn.app/e/7f3a2c…": the event's id, never its slug. */
  url?: string
  cancelled?: boolean
  /** Unlisted: the area only, no venue or street. */
  unlisted?: boolean
}

export type LinkPreview =
  | { template: 'event'; event: ShareEvent }
  | { template: 'venue'; name: string; typeLabel: string; area: string }
  | { template: 'invite' }
  | { template: 'app' }

/**
 * The OG card's geometry, in its own pixels (Flow 16 · 16.2 `og`): 1200 × 630,
 * the centre 630 square the part every crop keeps, 56 px margins. Its type is
 * the app's type scale at four times (its 48 px floor is the 12 pt floor), so
 * words take a TYPE role × `TEMPLATE_SCALE`; only the layout is in pixels.
 */
export const OG = {
  width: 1200,
  height: 630,
  edge: 56,
  square: 630,
  wing: 210,
  rightWing: 200,
  stackGap: 4,
  timeTop: 12,
  mark: { wing: 120, corner: 96, centre: 160 },
  chip: 72,
  band: { top: 275, height: 80 },
  ghost: { size: 720, right: -180, bottom: -200 },
  columnGap: 24,
  centreGap: 28,
  cornerGap: 20,
} as const
export const TEMPLATE_SCALE = 4
/** E2's long-title floor: 64 of its 88 px (the frame's `long`). */
const LONG_TITLE_SCALE = 64 / 88
/** The flyer behind a contained cover: blurred and darkened to 45% brightness. */
const COVER_DIM = 0.55
const COVER_BLUR = 24
const GHOST_OPACITY = 0.08
/** The 18+ chip's side padding: 45% of its height. */
const CHIP_PAD = 0.45

/** A type role at the template's scale, `k` device points per template pixel, in `family`. */
export function templateType(role: keyof typeof TYPE, k: number, family: string = TYPE[role].fontFamily): TextStyle {
  const t = TYPE[role]
  const s = TEMPLATE_SCALE * k
  return { fontFamily: family, fontSize: t.fontSize * s, lineHeight: t.lineHeight * s, letterSpacing: t.letterSpacing * s }
}

export const dateLine = (d: ShareEvent['date']) => `${d.day} ${d.num} ${d.month} · ${d.time}`
/** The parts that exist, joined: a venue with no area (or an area with no venue) never leaves a dangling separator. */
export const joinParts = (parts: (string | null | undefined)[], separator: string) => parts.filter(Boolean).join(separator)
export const placeLine = (e: Pick<ShareEvent, 'venue' | 'area' | 'unlisted'>) => (e.unlisted ? e.area : joinParts([e.venue, e.area], ' · '))

/**
 * A cover that is never cropped: contained on a blurred, darkened copy of
 * itself (Flow 16 · 16.2: DICE's card crops its own artist name).
 */
export function ContainedCover({ uri, radius = 0, testID }: { uri: string; radius?: number; testID?: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}>
      <Image testID={testID && `${testID}-blur`} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={COVER_BLUR} accessible={false} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint(COLOR.ink, COVER_DIM) }]} />
      <Image testID={testID} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" accessible={false} />
    </View>
  )
}

/** A template's words: drawn to its pixel grid, so the phone's text size never moves them (it is an image). */
export function TemplateText(props: TextProps) {
  return <Text allowFontScaling={false} {...props} />
}

/** "18+": orange, dark type, Geist Mono. */
function AgeChip({ k, testID }: { k: number; testID?: string }) {
  const h = OG.chip * k
  return (
    <View testID={testID} style={[styles.chip, { height: h, paddingHorizontal: h * CHIP_PAD, borderRadius: h / 2 }]}>
      <TemplateText style={[templateType('label', k, FONT_FAMILY.mono[700]), { color: COLOR.textOnOrangeFlat }]}>18+</TemplateText>
    </View>
  )
}

/**
 * The link preview (guidelines/components/LinkPreviewCard.html, Flow 16 ·
 * 16.2), drawn at any width: the product's face outside the app, and the
 * share tray's "This is what they'll see". Satoshi words, Geist Mono dates,
 * "18+" as an orange chip; the title lives in og:title, never on a covered
 * card.
 *
 * - `event` with a cover (E1): the date stack, the cover contained in the
 *   centre square, the mark and "18+". Cancelled strikes the date and lays the
 *   band across it.
 * - `event` without one (E2): the date line, the title (3 lines, shrinking
 *   to fit), venue · area, a giant monogram at 8% bleeding off the corner.
 * - `venue` (V1), `invite` (F1, no inviter), `app` (A1).
 *
 * An image: decorative for a screen reader (the tray reads the words). No
 * haptic, no motion. It never scales with text.
 */
export function LinkPreviewCard({ preview, width, radius = RADIUS.thumb, testID }: { preview: LinkPreview; width: number; radius?: number; testID?: string }) {
  const k = width / OG.width
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, { width, height: OG.height * k, borderRadius: radius }]}
    >
      {preview.template === 'event' && preview.event.cover ? <E1 event={preview.event} cover={preview.event.cover} k={k} testID={testID} /> : null}
      {preview.template === 'event' && !preview.event.cover ? <E2 event={preview.event} k={k} /> : null}
      {preview.template === 'venue' ? <Venue name={preview.name} sub={joinParts([preview.typeLabel, preview.area], ' · ')} k={k} /> : null}
      {preview.template === 'invite' ? <Centre title="You’re invited to Blend’n" sub="A friend wants to add you." k={k} /> : null}
      {preview.template === 'app' ? <Centre title="Blend’n" sub="Meet who’s there on the night." k={k} /> : null}
    </View>
  )
}

/** The centre square's column: x 285, 630 wide, inside the margins. */
const column = (k: number, gap: number) => ({ left: ((OG.width - OG.square) / 2) * k, width: OG.square * k, top: OG.edge * k, bottom: OG.edge * k, gap: gap * k })

function E1({ event, cover, k, testID }: { event: ShareEvent; cover: string; k: number; testID?: string }) {
  const m = OG.edge * k
  const label = templateType('label', k, FONT_FAMILY.mono[500])
  const struck: TextStyle | null = event.cancelled ? { textDecorationLine: 'line-through' } : null
  return (
    <>
      <View style={[styles.wing, { left: m, top: m, bottom: m, width: OG.wing * k, gap: OG.stackGap * k }]}>
        <TemplateText style={[label, styles.quiet]}>{event.date.day}</TemplateText>
        <TemplateText style={[templateType('numericDisplay', k, FONT_FAMILY.mono[700]), styles.ink, struck]}>{event.date.num}</TemplateText>
        <TemplateText style={[label, styles.quiet]}>{event.date.month}</TemplateText>
        <TemplateText style={[label, styles.orange, { marginTop: OG.timeTop * k }]}>{event.date.time}</TemplateText>
      </View>
      <View style={[styles.square, { left: ((OG.width - OG.square) / 2) * k, width: OG.square * k, height: OG.square * k }]}>
        <ContainedCover uri={cover} testID={testID && `${testID}-cover`} />
      </View>
      <View style={[styles.rightWing, { right: m, top: m, bottom: m, width: OG.rightWing * k }]}>
        <DiscMark height={OG.mark.wing * k} />
        <AgeChip k={k} testID={testID && `${testID}-18`} />
      </View>
      {event.cancelled ? (
        <View style={[styles.band, { top: OG.band.top * k, height: OG.band.height * k }]}>
          <TemplateText style={[templateType('label', k, FONT_FAMILY.mono[700]), { color: COLOR.ink }]}>CANCELLED</TemplateText>
        </View>
      ) : null}
    </>
  )
}

function E2({ event, k }: { event: ShareEvent; k: number }) {
  const m = OG.edge * k
  return (
    <>
      <View style={[styles.ghost, { right: OG.ghost.right * k, bottom: OG.ghost.bottom * k }]}>
        <DiscMark height={OG.ghost.size * k} fill="white" />
      </View>
      <View style={[styles.column, column(k, OG.columnGap)]}>
        <TemplateText style={[templateType('label', k, FONT_FAMILY.mono[500]), styles.orange]}>{dateLine(event.date)}</TemplateText>
        <TemplateText numberOfLines={3} adjustsFontSizeToFit minimumFontScale={LONG_TITLE_SCALE} style={[templateType('heading', k), styles.ink]}>
          {event.title}
        </TemplateText>
        <TemplateText style={[templateType('caption', k), styles.quiet]}>{placeLine(event)}</TemplateText>
      </View>
      <View style={[styles.corner, { right: m, top: m, gap: OG.cornerGap * k }]}>
        <AgeChip k={k} />
        <DiscMark height={OG.mark.corner * k} />
      </View>
    </>
  )
}

function Venue({ name, sub, k }: { name: string; sub: string; k: number }) {
  const m = OG.edge * k
  return (
    <>
      <View style={[styles.column, column(k, OG.columnGap)]}>
        <TemplateText style={[templateType('label', k, FONT_FAMILY.mono[500]), styles.orange]}>VENUE</TemplateText>
        <TemplateText style={[templateType('title', k), styles.ink]}>{name}</TemplateText>
        <TemplateText style={[templateType('caption', k), styles.quiet]}>{sub}</TemplateText>
      </View>
      <View style={[styles.corner, { right: m, top: m }]}>
        <DiscMark height={OG.mark.corner * k} />
      </View>
    </>
  )
}

function Centre({ title, sub, k }: { title: string; sub: string; k: number }) {
  return (
    <View style={[styles.column, styles.centred, column(k, OG.centreGap)]}>
      <DiscMark height={OG.mark.centre * k} />
      <TemplateText style={[templateType('heading', k), styles.ink, styles.centreText]}>{title}</TemplateText>
      <TemplateText style={[templateType('caption', k), styles.quiet, styles.centreText]}>{sub}</TemplateText>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLOR.ink, overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  wing: { position: 'absolute', justifyContent: 'center' },
  rightWing: { position: 'absolute', alignItems: 'flex-end', justifyContent: 'space-between' },
  square: { position: 'absolute', top: 0 },
  chip: { backgroundColor: COLOR.brandOrange, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, backgroundColor: COLOR.textPrimary, alignItems: 'center', justifyContent: 'center' },
  ghost: { position: 'absolute', opacity: GHOST_OPACITY },
  column: { position: 'absolute', justifyContent: 'center' },
  centred: { alignItems: 'center' },
  centreText: { textAlign: 'center' },
  corner: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  ink: { color: COLOR.textPrimary },
  quiet: { color: COLOR.textSecondary },
  orange: { color: COLOR.brandOrange },
})
