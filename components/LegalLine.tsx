import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'

import { font, useBoldText } from './ds/shared'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { COLOR } from '../lib/design/tokens'
import { Logger } from '../lib/logger'

/** The sentence may wrap before "Terms" or before "Privacy Policy", never inside it or after "Terms" (Policy. was left alone on a line). */
const NBSP = '\u00A0'

/**
 * "By continuing you agree to our Terms and Privacy Policy."
 *
 * The sentence asks for agreement, so the two documents it names have to be one tap away. It was plain text on both
 * sign-in screens: agreeing to something you could not open. Nested `Text` so the links wrap with the line. `caption`,
 * centred, in `textTertiary`; the links `textSecondary` and underlined (Flow 1 `legal`).
 */
export function LegalLine({ lead, style }: { lead: string; style?: StyleProp<TextStyle> }) {
  const bold = useBoldText()
  const open = (url: string) => {
    openInApp(url).catch((error) => Logger.warn('auth', 'Could not open a legal link', { url, error }))
  }
  return (
    <Text style={[font('caption', bold), styles.legal, style]}>
      {lead} agree to our{' '}
      <Text style={styles.link} onPress={() => open(BLENDN_LINKS.terms)} accessibilityRole="link">
        Terms
      </Text>
      {`${NBSP}and `}
      <Text style={styles.link} onPress={() => open(BLENDN_LINKS.privacy)} accessibilityRole="link">
        {`Privacy${NBSP}Policy`}
      </Text>
      .
    </Text>
  )
}

const styles = StyleSheet.create({
  legal: { color: COLOR.textTertiary, textAlign: 'center' },
  // A link inside a sentence: the sentence's size, a step brighter and underlined, so it reads as tappable.
  link: { color: COLOR.textSecondary, textDecorationLine: 'underline' },
})
