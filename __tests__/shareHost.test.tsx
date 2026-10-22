/*
 * The share tray and the Story sheet as the app drives them (Flow 16 · 16.1, 16.3): whatever `openShare` is given is
 * drawn once, each action does what the frame says, and the promise says whether the link went anywhere.
 */
const mockSetString = jest.fn()
const mockToast = jest.fn()
const mockOpenWhatsApp = jest.fn()
const mockInstalled = jest.fn()
const mockOpenCamera = jest.fn()
const mockShareStory = jest.fn()
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }))
let mockLeft: Promise<void> = Promise.resolve()
jest.mock('../lib/sheetDismissed', () => ({ ...jest.requireActual('../lib/sheetDismissed'), afterSheetDismissed: () => mockLeft }))
jest.mock('../lib/toast', () => ({ toast: (...a: unknown[]) => mockToast(...a) }))
jest.mock('../lib/shareWhatsApp', () => ({ openWhatsApp: (...a: unknown[]) => mockOpenWhatsApp(...a), whatsAppInstalled: () => mockInstalled() }))
jest.mock('../lib/storyShare', () => ({
  ...jest.requireActual('../lib/storyShare'),
  openStoryCamera: () => mockOpenCamera(),
  shareStory: (...a: unknown[]) => mockShareStory(...a),
  captureStory: jest.fn(),
  coverReady: jest.fn(async () => {}),
}))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native')
  return { GlassView: (props: object) => <View {...props} />, isGlassEffectAPIAvailable: jest.fn(() => true), isLiquidGlassAvailable: jest.fn(() => true) }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: (props: object) => <View {...props} /> }
})

import { act, fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Share } from 'react-native'

import { ShareHost } from '../components/share/ShareHost'
import { eventTarget } from '../lib/shareEvent'
import { eventLink, venueLink } from '../lib/shareLinks'
import { openShare, resetShareTray } from '../lib/shareTray'

const START = new Date(2026, 9, 4, 21, 0, 0).toISOString()
const EVENT = eventTarget({ id: 'e1', title: 'Neon Nights', startTime: START, venueName: 'Toit', city: 'Indiranagar', status: 'published', visibility: 'public' })!
const URL = eventLink('e1')
const VENUE = { kind: 'venue' as const, name: 'Toit', typeLabel: 'Brewery', area: 'Indiranagar', url: venueLink('v1') }
const INVITE = { kind: 'invite' as const, url: 'https://www.blendn.app/f/abc' }

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const settle = () => wait(40)
/** Opens the tray; `went` is the promise `openShare` returned, which settles when it closes. */
const open = async (target: Parameters<typeof openShare>[0]) => {
  let went!: Promise<boolean>
  await act(async () => { went = openShare(target) })
  await settle()
  return { went }
}
const press = async (name: string) => { await fireEvent.press(screen.getByRole('button', { name })); await settle() }

beforeEach(() => {
  resetShareTray()
  mockSetString.mockReset().mockResolvedValue(true)
  mockToast.mockReset()
  mockLeft = Promise.resolve()
  mockOpenWhatsApp.mockReset().mockResolvedValue(true)
  mockInstalled.mockReset().mockResolvedValue(true)
  mockOpenCamera.mockReset().mockResolvedValue(undefined)
  mockShareStory.mockReset().mockResolvedValue('image')
})

describe('the tray', () => {
  it('draws nothing until something is shared, then the card, the title and the four actions', async () => {
    await render(<ShareHost />)
    expect(screen.queryByText('This is what they’ll see')).toBeNull()
    await open(EVENT)
    expect(screen.getByText('This is what they’ll see')).toBeTruthy()
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(expect.arrayContaining(['WhatsApp', 'Instagram Story', 'Copy link', 'More…']))
    expect(screen.getByText('MESSAGE SENT WITH THE LINK')).toBeTruthy()
  })

  it('drops WhatsApp when the phone says it is not installed (the tray is not drawn before it knows)', async () => {
    mockInstalled.mockResolvedValue(false)
    await render(<ShareHost />)
    await open(EVENT)
    expect(screen.queryByRole('button', { name: 'WhatsApp' })).toBeNull()
    expect(screen.getByRole('button', { name: 'More…' })).toBeTruthy()
  })

  it('WhatsApp: the message and the link in a chat, then the tray closes and the promise says it went', async () => {
    await render(<ShareHost />)
    const { went } = await open(EVENT)
    await press('WhatsApp')
    expect(mockOpenWhatsApp).toHaveBeenCalledWith(`Neon Nights · Sun 4 Oct, 9 PM\nToit, Indiranagar\n${URL}`)
    await expect(went).resolves.toBe(true)
  })

  it('WhatsApp that will not open falls back to the system sheet, never to a dead button', async () => {
    mockOpenWhatsApp.mockResolvedValue(false)
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction })
    await render(<ShareHost />)
    const { went } = await open(EVENT)
    await press('WhatsApp')
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining(URL) })
    await expect(went).resolves.toBe(true)
  })

  it('Copy link copies the link alone, with no toast (the tray says “Copied”), and leaves the tray open', async () => {
    await render(<ShareHost />)
    const { went } = await open(EVENT)
    await press('Copy link')
    expect(mockSetString).toHaveBeenCalledWith(URL)
    expect(mockToast).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    // dismissing afterwards still reports that the link went somewhere
    await fireEvent.press(screen.getByLabelText('Dismiss'))
    await settle()
    await expect(went).resolves.toBe(true)
  })

  it('a clipboard that refuses closes the tray and says so once it has left: a toast under a Modal is never seen on iOS', async () => {
    mockSetString.mockRejectedValue(new Error('no'))
    let leave!: () => void
    mockLeft = new Promise<void>((resolve) => { leave = resolve })
    await render(<ShareHost />)
    const { went } = await open(EVENT)
    await press('Copy link')
    expect(mockToast).not.toHaveBeenCalled()
    await expect(went).resolves.toBe(false)
    await act(async () => leave())
    expect(mockToast).toHaveBeenCalledWith("Couldn't copy the link. Try again.", 'error')
  })

  it('More… opens the system sheet with the message; dismissing it reports nothing went', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction })
    await render(<ShareHost />)
    const { went } = await open(EVENT)
    await press('More…')
    await expect(went).resolves.toBe(false)
  })

  it('a venue shares its name and its link; an invite shares the short ask and no name', async () => {
    await render(<ShareHost />)
    await open(VENUE)
    expect(screen.getByText('Brewery · Indiranagar')).toBeTruthy()
    await press('WhatsApp')
    expect(mockOpenWhatsApp).toHaveBeenLastCalledWith(`Toit on Blend'n\n${VENUE.url}`)
    await open(INVITE)
    expect(screen.getByText('A link only you can send · no name on the card')).toBeTruthy()
    await press('WhatsApp')
    expect(mockOpenWhatsApp).toHaveBeenLastCalledWith("Add me on Blend'n: https://www.blendn.app/f/abc")
  })

  it('an unlisted event shows the area only: not in the line, not in the message', async () => {
    const unlisted = eventTarget({ id: 'e2', title: 'Quiet Night', startTime: START, venueName: 'Secret Bar', city: 'Indiranagar', status: 'published', visibility: 'unlisted' })!
    await render(<ShareHost />)
    await open(unlisted)
    expect(screen.queryByText(/Secret Bar/, { includeHiddenElements: true })).toBeNull()
  })
})

describe('Instagram Story', () => {
  it('an event goes through the Story sheet: the card, the toggle off, then Share to Instagram', async () => {
    await render(<ShareHost />)
    const { went } = await open(EVENT)
    await press('Instagram Story')
    await wait(700)
    expect(screen.getByText('Share to your Story')).toBeTruthy()
    expect(screen.getByRole('switch', { name: /Say I’m going/ }).props.accessibilityState.checked).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: 'Share to Instagram' }))
    // the sheet leaves first; the work starts once it has
    expect(mockShareStory).not.toHaveBeenCalled()
    await wait(700)
    expect(mockShareStory).toHaveBeenCalledWith(expect.objectContaining({ url: URL }))
    await expect(went).resolves.toBe(true)
  })

  it('“Not now” leaves without sharing, and the promise says nothing went', async () => {
    await render(<ShareHost />)
    const { went } = await open(EVENT)
    await press('Instagram Story')
    await wait(700)
    await press('Not now')
    expect(mockShareStory).not.toHaveBeenCalled()
    await expect(went).resolves.toBe(false)
  })

  it('a venue has no card to draw: it copies the link and opens Instagram’s Story camera for the Link sticker', async () => {
    await render(<ShareHost />)
    const { went } = await open(VENUE)
    await press('Instagram Story')
    expect(mockSetString).toHaveBeenCalledWith(VENUE.url)
    expect(mockOpenCamera).toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Link copied — add it with the Link sticker', 'success')
    await expect(went).resolves.toBe(true)
  })

  it('a venue’s “Link copied” toast waits for the tray to leave', async () => {
    let leave!: () => void
    mockLeft = new Promise<void>((resolve) => { leave = resolve })
    await render(<ShareHost />)
    await open(VENUE)
    await press('Instagram Story')
    expect(mockOpenCamera).toHaveBeenCalled()
    expect(mockToast).not.toHaveBeenCalled()
    await act(async () => leave())
    expect(mockToast).toHaveBeenCalledWith('Link copied — add it with the Link sticker', 'success')
  })

  it('says so when Instagram will not open', async () => {
    mockOpenCamera.mockRejectedValue(new Error('no'))
    await render(<ShareHost />)
    const { went } = await open(INVITE)
    await press('Instagram Story')
    await settle()
    expect(mockToast).toHaveBeenCalledWith("Instagram didn't open. Try again.", 'error')
    await expect(went).resolves.toBe(false)
  })
})
