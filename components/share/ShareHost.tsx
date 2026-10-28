import * as Clipboard from 'expo-clipboard'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Share } from 'react-native'

import { shareText, shareUrl } from '../../lib/shareEvent'
import { venueTextOnly } from '../../lib/shareLinks'
import { closeShare, useShareRequest } from '../../lib/shareTray'
import { openWhatsApp, whatsAppInstalled } from '../../lib/shareWhatsApp'
import { openStoryCamera, STORY_LINK_COPIED, sweepStoryCaptures } from '../../lib/storyShare'
import { afterSheetDismissed } from '../../lib/sheetDismissed'
import { toast, type ToastVariant } from '../../lib/toast'
import { HueProvider } from '../ds/shared'
import { ShareSheet, type ShareTarget } from '../ds/ShareSheet'
import { StoryOptionsSheet } from './StoryOptionsSheet'

/** If the tray's exit never reports, the Story sheet opens anyway after this long. */
const CHAIN_FALLBACK_MS = 600

/** A venue's Story has no link to copy while its page is not live: the words are copied instead. */
const STORY_TEXT_COPIED = 'Copied — paste it into your Story'

type Stage = 'tray' | 'handoff' | 'story'

/**
 * Draws the share tray and the Story sheet for whatever `openShare` was last given (`lib/shareTray`), and does what each
 * action says (Flow 16 · 16.1):
 *
 * - WhatsApp: the message and the link in a chat. No WhatsApp (iOS says so up front; Android when the hand-off fails)
 *   falls back to More…, never to a dead button.
 * - Instagram Story: an event goes through the Story options sheet (the card, one toggle); a venue or an invite has no
 *   card to draw, so it copies the link and opens Instagram's Story camera for the Link sticker.
 * - Copy link: the link alone. "Copied" is the tray's own, so there is no toast; a clipboard that refuses is an error toast.
 * - More…: the system share sheet with the message.
 *
 * One host, mounted once: the Scene, the venue page, Add friends, Going and the Pulse's peek only call `openShare`.
 */
export function ShareHost() {
  const request = useShareRequest()
  // Once, at launch: the picture a killed share left behind (lib/storyShare.ts).
  useEffect(() => {
    void sweepStoryCaptures()
  }, [])
  /** The last request stays drawn while its sheet leaves: unmounting a Modal would cut the exit short. */
  const [held, setHeld] = useState(request)
  if (request && request.id !== held?.id) setHeld(request)
  const current = request ?? held
  // A new request is a new flow, with nothing carried over from the one before.
  return current ? <ShareFlow key={current.id} target={current.target} shown={request !== null} /> : null
}

function ShareFlow({ target, shown }: { target: ShareTarget; shown: boolean }) {
  const [stage, setStage] = useState<Stage>('tray')
  const [whatsApp, setWhatsApp] = useState<boolean | null>(null)
  /** The link went somewhere: what `openShare` resolves with when the tray closes. */
  const went = useRef(false)
  // A venue shared before its page exists is words only: no link that opens the homepage (E12, SYS-04).
  const textOnly = target.kind === 'venue' ? venueTextOnly(target.name) : null
  const text = textOnly ?? shareText(target)
  const url = textOnly ? undefined : shareUrl(target)
  /** What Copy and the Story copy: the link, or the words when there is no link. */
  const copyable = url ?? textOnly ?? undefined

  useEffect(() => {
    let live = true
    void whatsAppInstalled().then((installed) => live && setWhatsApp(installed))
    return () => {
      live = false
    }
  }, [])

  const finish = useCallback(() => closeShare(went.current), [])

  // The tray has left: the Story sheet may rise (iOS drops a Modal presented while another is still leaving).
  const openStory = useCallback(() => setStage((s) => (s === 'handoff' ? 'story' : s)), [])
  useEffect(() => {
    if (stage !== 'handoff') return
    const timer = setTimeout(openStory, CHAIN_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [stage, openStory])

  /**
   * Closes the tray, then says `message`. An RN Modal is above the toast on iOS, so a toast raised while the tray is still
   * up is never seen: it waits for the tray to have left (`lib/sheetDismissed`).
   */
  const closeThenSay = async (message: string, variant: ToastVariant) => {
    const left = afterSheetDismissed()
    finish()
    await left
    toast(message, variant)
  }

  const more = async () => {
    try {
      const result = await Share.share({ message: text })
      if (result.action === Share.sharedAction) went.current = true
    } catch {
      return closeThenSay("Couldn’t open sharing. Try again.", 'error')
    }
    finish()
  }

  const copy = () => {
    if (!copyable) return
    Clipboard.setStringAsync(copyable).then(
      () => {
        went.current = true
      },
      () => void closeThenSay("Couldn’t copy the link. Try again.", 'error')
    )
  }

  const whatsAppSend = async () => {
    if (await openWhatsApp(text)) {
      went.current = true
      finish()
      return
    }
    // Not installed after all: the system sheet covers it.
    await more()
  }

  const story = async () => {
    if (target.kind === 'event') {
      setStage('handoff')
      return
    }
    try {
      if (copyable) await Clipboard.setStringAsync(copyable)
      await openStoryCamera()
      went.current = true
    } catch {
      return closeThenSay("Instagram didn’t open. Try again.", 'error')
    }
    return closeThenSay(textOnly ? STORY_TEXT_COPIED : STORY_LINK_COPIED, 'success')
  }

  // Mounted once, outside every screen's world: an invite is among people (Add friends, rose), an event or a place is going out (ember).
  return (
    <HueProvider value={target.kind === 'invite' ? 'rose' : 'ember'}>
      <ShareSheet
        visible={shown && stage === 'tray' && whatsApp !== null}
        onClose={finish}
        onDismissed={openStory}
        share={target}
        whatsApp={whatsApp ?? true}
        onWhatsApp={() => void whatsAppSend()}
        onStory={() => void story()}
        onCopy={copy}
        onMore={() => void more()}
        testID="share-tray"
      />
      {target.kind === 'event' ? (
        <StoryOptionsSheet
          visible={shown && stage === 'story'}
          onClose={finish}
          onDone={(outcome) => {
            if (outcome === 'image') went.current = true
            finish()
          }}
          variant={{ kind: 'story', event: target.event }}
          url={url}
          testID="share-story"
        />
      ) : null}
    </HueProvider>
  )
}
