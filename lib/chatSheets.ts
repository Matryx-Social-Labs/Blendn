import * as Clipboard from 'expo-clipboard'
import { Linking } from 'react-native'

import { linkHost } from '../components/ds/chatShared'
import { Logger } from './logger'
import type { Sheet } from './sheet'

/** Copying is silent: no haptic, no toast (ROUND3 C20). */
export const copyText = (text: string) => {
  Clipboard.setStringAsync(text).catch(() => {})
}

/**
 * A send that never arrived, long-pressed (Flow 5 room #16, R3-D5 5.2): Try
 * again · Copy · Delete · Cancel. `to` is who it did not reach: "the room",
 * or the person in a DM.
 */
export function notSentSheet({ to, text, onRetry, onDelete }: { to: string; text: string; onRetry: () => void; onDelete: () => void }): Sheet {
  return {
    kind: 'actions',
    hue: 'rose',
    icon: 'circle-alert',
    title: 'Not sent',
    message: `This message didn’t reach ${to}.`,
    actions: [
      { label: 'Try again', variant: 'primary', then: onRetry },
      { label: 'Copy', then: () => copyText(text) },
      { label: 'Delete', variant: 'destructive', then: onDelete },
      { label: 'Cancel', cancel: true },
    ],
  }
}

/**
 * A link in a bubble opens through a sheet that names its host, never a
 * preview (R10, R3-D5 5.11): fetching one would hand the poster the reader's
 * address — from an anonymous room, the whole point of which is not to. The
 * host is the parsed URL's (`linkHost`), and only http(s) ever opens; anything
 * else gets Copy and nothing to open.
 */
export function linkSheet(url: string, surface: 'room' | 'dm'): Sheet {
  const host = linkHost(url)
  if (!host) {
    return {
      kind: 'actions',
      hue: 'rose',
      icon: 'external-link',
      title: 'This link can’t be opened',
      message: 'Blend’n opens only web links it can name. You can still copy it.',
      actions: [
        { label: 'Copy link', then: () => copyText(url) },
        { label: 'Cancel', cancel: true },
      ],
    }
  }
  return {
    kind: 'actions',
    hue: 'rose',
    icon: 'external-link',
    title: `Open ${host}?`,
    message:
      surface === 'room'
        ? 'This link leaves Blend’n and opens in your browser. Blend’n never fetches a preview: the site would see your address from an anonymous room.'
        : 'This link leaves Blend’n and opens in your browser. Blend’n never fetches a preview, so nobody learns your address from it.',
    actions: [
      {
        label: `Open ${host}`,
        variant: 'primary',
        then: () => {
          Linking.openURL(url).catch((error) => Logger.warn('chat', 'Could not open a link', { error }))
        },
      },
      { label: 'Copy link', then: () => copyText(url) },
      { label: 'Cancel', cancel: true },
    ],
  }
}
