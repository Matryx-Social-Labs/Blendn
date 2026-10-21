import { Linking } from 'react-native'

import { SystemScreen } from './SystemScreen'
import { accountStateCopy } from '../../lib/accountStateCopy'
import { setAccountState, type AccountState } from '../../lib/accountState'
import { H } from '../../lib/haptics'
import { DASHBOARD_URL } from '../../lib/links'
import { SUPPORT_EMAIL, supportMailto } from '../../lib/support'

/**
 * The full-screen state for an account the server refused (Flow 15 15.1 to 15.3): no sign-in buttons anywhere on it, the
 * server's sentence where it has one, and the one way forward that fits. Suspended and deleted write to support; a staff
 * account opens the dashboard. "Back to start" and "Use a different account" clear it and show the landing again.
 *
 * Email support, Open the dashboard and Contact support are the screen's strong action and play `H.primary`; the text
 * action plays nothing. The inline support address is the same action, in the sentence.
 */
export function AccountStateScreen({ state }: { state: AccountState }) {
  const copy = accountStateCopy(state.kind, state.sentence)
  const mail = (subject: string) => () => void Linking.openURL(supportMailto({ subject })).catch(() => {})
  const dismiss = () => setAccountState(null)

  const actions =
    state.kind === 'suspended'
      ? [
          { label: 'Email support', kind: 'strong' as const, pressHaptic: () => H.primary(), onPress: mail("Blend'n account suspended") },
          { label: 'Back to start', kind: 'tertiary' as const, onPress: dismiss },
        ]
      : state.kind === 'staff'
        ? [
            {
              label: 'Open the dashboard',
              kind: 'strong' as const,
              icon: 'arrow-up-right' as const,
              pressHaptic: () => H.primary(),
              onPress: () => void Linking.openURL(DASHBOARD_URL).catch(() => {}),
            },
            { label: 'Use a different account', kind: 'tertiary' as const, onPress: dismiss },
          ]
        : [
            { label: 'Contact support', kind: 'strong' as const, pressHaptic: () => H.primary(), onPress: mail("Blend'n sign-in") },
            { label: 'Use a different account', kind: 'tertiary' as const, onPress: dismiss },
          ]

  return (
    <SystemScreen
      icon={copy.icon}
      title={copy.title}
      body={copy.body}
      bodyLink={copy.link ? { text: SUPPORT_EMAIL, onPress: mail("Blend'n account suspended") } : undefined}
      note={copy.note}
      actions={actions}
      testID={`account-${state.kind}`}
    />
  )
}
