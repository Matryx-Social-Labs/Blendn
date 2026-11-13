import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { crewMessage, goingLine, inYouLast, type Crew, type CrewPlan } from '../../lib/crews'
import { crewsApi } from '../../lib/crewsApi'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { showSheet } from '../../lib/sheet'
import { Button } from '../ds/Button'
import { CrewEmblem } from '../ds/CrewEmblem'
import { Facepile, type Face } from '../ds/Facepile'
import { font, useBoldText, useIncreaseContrast } from '../ds/shared'
import { useToast } from '../Toast'

type MyCrew = Pick<Crew, 'crewId' | 'name' | 'emblemSeed'>

const EMBLEM = 40
const FACE = 24
const WHO_SEES = 'Your crew sees it in the crew chat. Nobody else does.'

/** Which crew to plan with: the one, or the person's pick among several (null: they backed out). */
function chooseCrew(crews: readonly MyCrew[]): Promise<MyCrew | null> {
  if (crews.length === 1) return Promise.resolve(crews[0])
  return new Promise((resolve) =>
    showSheet({
      kind: 'actions',
      hue: 'rose',
      title: 'Going together with…',
      message: WHO_SEES,
      onDismiss: () => resolve(null),
      actions: [...crews.map((c) => ({ label: c.name, then: () => resolve(c) })), { label: 'Cancel', cancel: true as const }],
    })
  )
}

/**
 * "Going together" on the event page (crews 4-A1, board 04-checkin A1), for your crew only: "Going with Nebula?" and the lit
 * button that marks the night — the server writes the crew-chat line and one push per crew per night. Planned, the button
 * reads "You’re going together" and a tap takes it back. Crewmates going are named in their own card ("Priya and Arjun are
 * going · From Nebula"); never you, and never who is not going. No crew: nothing. `plans` is `userStatus.myCrewPlans`;
 * `onChanged` re-reads the event after a plan lands.
 */
export function GoingTogether({ eventId, plans, onChanged }: { eventId: string; plans: readonly CrewPlan[]; onChanged: () => void }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const { showToast } = useToast()
  const [mine, setMine] = useState<MyCrew[]>([])
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  useEffect(() => {
    let live = true
    Promise.resolve()
      .then(() => crewsApi.myCrews())
      .then((r) => live && r.success && setMine(r.data?.crews ?? []))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [eventId])

  const planned = plans.find((p) => mine.some((m) => m.crewId === p.crewId)) ?? plans[0]
  if (mine.length === 0 && !planned) return null
  const lead: MyCrew | null = planned ?? (mine.length === 1 ? mine[0] : null)
  const going = plans.filter((p) => goingLine(p.going))

  const press = async () => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    try {
      const crew = planned ?? (await chooseCrew(mine))
      if (!crew) return
      const result = planned ? await crewsApi.unplan(crew.crewId, eventId) : await crewsApi.plan(crew.crewId, eventId)
      if (!result.success) {
        showToast(crewMessage(result, 'crew', planned ? 'Couldn’t take it back. Try again.' : 'Couldn’t plan it with your crew. Try again.'), 'error', { haptic: 'error' })
        return
      }
      onChanged()
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  return (
    <View testID="going-together" style={styles.stack}>
      <View style={styles.card}>
        <View style={styles.top}>
          {lead ? <CrewEmblem seed={lead.emblemSeed} size={EMBLEM} /> : null}
          <View style={styles.fill}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} numberOfLines={2} style={[font('bodyStrong', bold), styles.ink]}>
              {lead ? `Going with ${lead.name}?` : 'Going with your crew?'}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: secondary }]}>
              {WHO_SEES}
            </Text>
          </View>
        </View>
        <Button
          kind="lit"
          icon={planned ? 'check' : 'users'}
          label={planned ? 'You’re going together' : 'Going together'}
          loading={busy}
          onPress={() => void press()}
          testID="going-together-button"
        />
      </View>
      {going.map((p) => (
        <View key={p.crewId} testID={`going-together-${p.crewId}`} accessible style={[styles.card, styles.top]}>
          <Facepile faces={inYouLast(p.going).filter((x) => !x.you).map((x): Face => (x.photo ? { kind: 'photo', uri: x.photo } : { kind: 'creature', pseudonym: x.name }))} size={FACE} max={3} ring={COLOR.surface} accessibilityLabel="" />
          <View style={styles.fill}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} numberOfLines={2} style={[font('bodyStrong', bold), styles.ink]}>
              {goingLine(p.going)}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} numberOfLines={1} style={[font('meta', bold), { color: secondary }]}>
              {`From ${p.name}`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  card: { backgroundColor: COLOR.surface, borderRadius: RADIUS.sheet, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, gap: SPACE.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  fill: { flex: 1, minWidth: 0 },
  ink: { color: COLOR.textPrimary },
})
