import { StyleSheet, Text, View } from 'react-native'

import { COLOR, SPACE } from '../../lib/design/tokens'
import type { Crew } from '../../lib/crews'
import { intentLine } from '../../lib/crewsScreens'
import { Chip } from '../ds/Chip'
import { CrewEmblem } from '../ds/CrewEmblem'
import { font, useBoldText, useIncreaseContrast } from '../ds/shared'

const EMBLEM = 160

/**
 * A crew's head (flow10.js `detail`): the emblem at 160, the name, the line
 * about it, and the tags with the intent beside them. Nothing about who is in
 * it — that is the Members list under it, and only members see that.
 */
export function CrewHead({ crew }: { crew: Pick<Crew, 'name' | 'bio' | 'tags' | 'intent' | 'emblemSeed'> }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const intent = intentLine(crew.intent)
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  return (
    <View style={styles.head}>
      <CrewEmblem seed={crew.emblemSeed} size={EMBLEM} />
      <Text accessibilityRole="header" style={[font('title', bold), styles.ink, styles.centre]}>
        {crew.name}
      </Text>
      {crew.bio ? <Text style={[font('body', bold), styles.centre, { color: secondary }]}>{crew.bio}</Text> : null}
      {crew.tags.length || intent ? (
        <View style={styles.meta}>
          {crew.tags.map((t) => (
            <Chip key={t.slug} label={t.label} variant="outline" />
          ))}
          {intent ? <Text style={[font('meta', bold), { color: secondary }]}>{intent}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: SPACE.md },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  centre: { textAlign: 'center' },
})
