import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { apiClient } from '../../lib/apiClient'
import { withCrewChoice, type Crew, type CrewPlan } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { Chip } from '../ds/Chip'
import { CrewEmblem } from '../ds/CrewEmblem'
import { font, useAnnounced, useBoldText } from '../ds/shared'

type ChipCrew = Pick<Crew, 'crewId' | 'name' | 'emblemSeed'>

/** The board's 22 pt emblem in the chip (crews/04 A2). */
const EMBLEM = 22
const ON_LINE = 'Tells your crew you’re in. Tap to come in on your own tonight.'
const OFF_LINE = 'Coming in on your own: your crew isn’t told. Tap to come in with them.'
/** After the hold, the same slot (the pass never changes height under the pour): what happened. */
const TOLD_LINE = 'Your crew knows you’re in.'
const ALONE_LINE = 'You came in on your own.'

/**
 * Which crew the hold's "With {crew}" chip is for, and whether it is on (crews 4-A2, owner 1b): on by default only when that
 * crew planned tonight (`userStatus.myCrewPlans`), else your first crew, off. The person's own tap wins over the default.
 * `withCrewId` is what the hold sends: only while on. `eventId` null (no door): reads nothing. `pagePlans`: the event page's
 * own `myCrewPlans`, so a night planned there turns the chip on at once (the Tonight pass reads the event itself).
 */
export function useWithCrew(eventId: string | null, pagePlans?: readonly CrewPlan[]) {
  const [mine, setMine] = useState<ChipCrew[]>([])
  const [plans, setPlans] = useState<CrewPlan[]>([])
  const [tapped, setTapped] = useState<{ eventId: string; on: boolean } | null>(null)
  // The page that has the plans already hands them in; only the Tonight pass reads the event for them.
  const readsPlans = !pagePlans
  useEffect(() => {
    if (!eventId) return
    let live = true
    // Both reads are best-effort: without them there is simply no chip, and the hold works as it always did.
    // Through a resolved promise, so even a throw inside the call lands in the catch, never in the effect.
    Promise.resolve()
      .then(() => crewsApi.myCrews())
      .then((r) => live && r.success && setMine(r.data?.crews ?? []))
      .catch(() => {})
    if (!readsPlans) return () => void (live = false)
    Promise.resolve()
      .then(() => apiClient.getEvent(eventId))
      .then((r) => live && r.success && setPlans(r.data?.userStatus?.myCrewPlans ?? []))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [eventId, readsPlans])
  const choice = eventId ? withCrewChoice(mine, pagePlans ?? plans) : null
  const on = choice ? (tapped?.eventId === eventId ? tapped.on : choice.on) : false
  return {
    crew: choice ? { crewId: choice.crewId, name: choice.name, emblemSeed: choice.emblemSeed } : null,
    on,
    withCrewId: choice && on ? choice.crewId : undefined,
    toggle: () => eventId && setTapped({ eventId, on: !on }),
  }
}

/**
 * "With {crew}" under your own Hold to Blend’n (board crews/04 A2): the crew's emblem, its name and a check, and one line
 * saying what it does. Off, you come in on your own: the crew is not told and you are not on its strip. `landed`: the hold is
 * done, so the chip is read-only and its line says what happened; if it told the crew, the huddle cheers once (Reduce Motion:
 * the still). `H.select` on a tap (Chip).
 */
export function WithCrewChip({ crew, on, landed = false, onToggle }: { crew: ChipCrew; on: boolean; landed?: boolean; onToggle: () => void }) {
  const bold = useBoldText()
  const line = landed ? (on ? TOLD_LINE : ALONE_LINE) : on ? ON_LINE : OFF_LINE
  // Said when it changes (a tap, the hold landing), never on arrival: the chip's own label is read with the hold.
  useAnnounced(line, { changesOnly: true })
  return (
    <View testID="with-crew" style={styles.wrap}>
      {/* Centred under the hold (board A2): the Chip sits flex-start, so a box that hugs it is what centres. */}
      <View style={styles.hug}>
        <Chip
          label={`With ${crew.name}`}
          selected={on}
          selection="multi"
          size="lg"
          lead={<CrewEmblem seed={crew.emblemSeed} size={EMBLEM} scene={landed && on ? 'cheer' : undefined} />}
          onPress={landed ? undefined : onToggle}
          testID="with-crew-chip"
        />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} accessibilityLiveRegion="polite" style={[font('caption', bold), styles.line]}>
        {line}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: SPACE.sm },
  hug: { maxWidth: '100%' },
  line: { color: COLOR.textSecondary, textAlign: 'center' },
})
