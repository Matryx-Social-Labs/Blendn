import { Linking, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'

import { BLENDN_LINKS } from '../lib/links'
import { Logger } from '../lib/logger'
import { EMBER, TYPE } from '../lib/theme'

/**
 * "By continuing you agree to our Terms and Privacy Policy."
 *
 * The sentence asks for agreement, so the two documents it names have to be
 * one tap away. It was plain text on both sign-in screens: agreeing to
 * something you could not open. Nested `Text` so the links wrap with the line.
 */
export function LegalLine({ lead, style }: { lead: string; style?: StyleProp<TextStyle> }) {
  const open = (url: string) => {
    Linking.openURL(url).catch((error) => Logger.warn('auth', 'Could not open a legal link', { url, error }))
  }
  return (
    <Text style={[styles.legal, style]}>
      {lead} agree to our{' '}
      <Text
        style={styles.link}
        onPress={() => open(BLENDN_LINKS.terms)}
        accessibilityRole="link"
      >
        Terms
      </Text>
      {' and '}
      <Text
        style={styles.link}
        onPress={() => open(BLENDN_LINKS.privacy)}
        accessibilityRole="link"
      >
        Privacy Policy
      </Text>
      .
    </Text>
  )
}

const styles = StyleSheet.create({
  legal: { ...TYPE.meta, color: EMBER.textTertiary, textAlign: 'center' },
  // A link inside a sentence: the sentence's size, lifted to primary and
  // underlined so it reads as tappable without borrowing the accent.
  link: { color: EMBER.textPrimary, textDecorationLine: 'underline' },
})
