import { useRef, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, RADIUS, SPACE } from '../../lib/design/tokens'
import type { Rect } from '../ds/chatShared'
import { InterestChip } from '../ds/Chip'
import { SectionHeader, type SectionAction } from '../ds/SectionHeader'
import { font, useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { OptimizedImage } from '../OptimizedImage'

/**
 * A profile, in pieces (Flow 6 `user`, `friend`, `me`). Presentational only: each takes formatted values and draws them; the
 * screens keep the fetching, the permissions and the handlers.
 *
 * ## The screen has three states and only the server knows which
 *
 * `app/api/mobile/profiles/[userId]` gates on `maySeeIdentity`, and the split it makes is not "show less", it is a different
 * set of facts:
 *
 *   unrevealed   age, interests, location, work_field
 *   revealed     ...and name, photo, bio, occupation, education, gallery
 *   self         ...and email, and the dating fields
 *
 * Nothing here re-derives any of that. A missing field is simply not drawn, and never drawn as a fault: "no bio" and "not allowed
 * to see the bio" look identical in the payload by design, and inventing a distinction in the UI would leak the one the server
 * withheld.
 */

/** Flow 6's column gap between sections: 28, between the 24 and 32 steps. */
// design-exception: the frame's column gap is 28
export const SECTION_GAP = 28
/** Flow 6 `gallery`: 163 pt cells, two across, 8 apart. */
const GALLERY_HEIGHT = 163

/** A section: the DS heading, then its body 12 pt below (Flow 6 `sectionH`). */
export function ProfileSection({
  title,
  count,
  trailing,
  action,
  children,
  testID,
}: {
  title: string
  count?: number
  /** A plain note at the heading's right ("3 photos", "3 shared"): not an action. */
  trailing?: string | null
  /** A text action at the right ("See all"). */
  action?: SectionAction
  children: ReactNode
  testID?: string
}) {
  const bold = useBoldText()
  return (
    <View testID={testID} style={styles.section}>
      <SectionHeader
        title={title}
        count={count}
        action={action}
        right={trailing ? <Text style={[font('meta', bold), styles.muted]}>{trailing}</Text> : undefined}
      />
      {children}
    </View>
  )
}

/** The bio, in `body` on the page (Flow 6 draws it white, 17/24). */
export function ProfileBio({ text }: { text: string }) {
  const bold = useBoldText()
  return <Text style={[font('body', bold), styles.ink]}>{text}</Text>
}

/**
 * Their interests as read-only chips, 8 pt apart. One they share with you is outlined (`shared`), which marks the most useful
 * thing on the screen: the reason you might talk to them. Any number, any length: a wrapping row, not the frame's fixed five.
 */
export function ProfileInterests({ interests, sharedInterests }: { interests: string[]; sharedInterests?: string[] }) {
  const shared = new Set((sharedInterests ?? []).map((s) => s.toLowerCase()))
  return (
    <View style={styles.chips}>
      {interests.map((interest) => (
        <InterestChip key={interest} label={interest} shared={shared.has(interest.toLowerCase())} />
      ))}
    </View>
  )
}

/**
 * Occupation and education (Flow 6 `detail`): the first a `surface` card at radius 24, the second a bare block with a 2 pt
 * left rule. The asymmetry is what stops two adjacent facts reading as a table. One line each: `profiles.occupation` and
 * `profiles.education` are single strings.
 */
export function ProfileDetail({ label, value, variant = 'card' }: { label: string; value: string; variant?: 'card' | 'ruled' }) {
  const bold = useBoldText()
  return (
    <View accessible accessibilityLabel={`${label.toLowerCase()}, ${value}`} style={variant === 'card' ? styles.detailCard : styles.detailRuled}>
      <Text style={[font('label', bold, FONT_FAMILY.mono[500]), styles.muted]}>{label}</Text>
      <Text style={[font('body', bold), styles.ink]}>{value}</Text>
    </View>
  )
}

/** Two columns, 8 pt apart, 163 pt cells (Flow 6 `gallery`). A tap says where the cell is, so the viewer can travel from it (DS #33). */
export function ProfileGallery({
  photos,
  columnWidth,
  onPressPhoto,
}: {
  photos: string[]
  columnWidth: number
  onPressPhoto?: (index: number, from: Rect | null) => void
}) {
  const cells = useRef<Record<number, View | null>>({})
  const press = (i: number) => {
    const cell = cells.current[i]
    if (!cell) return onPressPhoto?.(i, null)
    cell.measureInWindow((x, y, width, height) => onPressPhoto?.(i, { x, y, width, height }))
  }
  return (
    <View style={styles.galleryGrid}>
      {photos.map((url, i) => (
        <View
          key={`${url}:${i}`}
          ref={(node) => {
            cells.current[i] = node
          }}
          collapsable={false}
          style={[styles.galleryCell, { width: columnWidth }]}
        >
          <ScalePress
            onPress={() => press(i)}
            haptic={false}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
            style={styles.galleryImage}
          >
            <OptimizedImage source={url} recyclingKey={url} style={styles.galleryImage as never} width={Math.round(columnWidth)} height={GALLERY_HEIGHT} contentFit="cover" />
          </ScalePress>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: SPACE.md },
  ink: { color: COLOR.textPrimary },
  muted: { color: COLOR.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  detailCard: { backgroundColor: COLOR.surface, borderRadius: RADIUS.mediaInCard, padding: SPACE.lg, gap: SPACE.xs },
  detailRuled: { borderLeftWidth: SPACE.xxs, borderLeftColor: COLOR.hairlineStrong, paddingLeft: SPACE.lg, gap: SPACE.xs },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  galleryCell: { height: GALLERY_HEIGHT, borderRadius: RADIUS.mediaInCard, overflow: 'hidden', backgroundColor: COLOR.surface },
  galleryImage: { width: '100%', height: '100%' },
})
