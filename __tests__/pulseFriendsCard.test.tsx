/**
 * "Bring your friends" (ledger row 14): the onboarding screen became one dismissible card after the Pulse's lead card.
 * Gone for good once the link was shared or the card dismissed, per account.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

const mockShare = jest.fn()
jest.mock('../lib/useFriendInvite', () => ({ useFriendInvite: () => ({ invite: { token: 't', url: 'https://blendn.app/f/t' }, failed: false, share: mockShare, reload: jest.fn(), reset: jest.fn() }) }))

/* eslint-disable import/first */
import { FriendsCard } from '../components/pulse/FriendsCard'
import { friendsCardDone } from '../lib/friendsCard'
/* eslint-enable import/first */

beforeEach(async () => {
  mockShare.mockReset()
  await AsyncStorage.clear()
})

it('shows the card with the onboarding screen’s words and one share action', async () => {
  await render(<FriendsCard userId="u1" />)
  expect(await screen.findByText('Bring your friends')).toBeTruthy()
  expect(screen.getByText('Nobody can find you on Blend’n by searching. Send your link, and anyone you send it to can ask to be your friend.')).toBeTruthy()
  expect(screen.getByLabelText('Share my link')).toBeTruthy()
})

it('✕ hides it for good, for this account only', async () => {
  const { rerender } = await render(<FriendsCard key="first" userId="u1" />)
  await act(async () => fireEvent.press(await screen.findByLabelText('Dismiss, bring your friends')))
  expect(screen.queryByText('Bring your friends')).toBeNull()
  expect(await friendsCardDone('u1')).toBe(true)
  // A fresh mount, as the next launch is.
  await rerender(<FriendsCard key="again" userId="u1" />)
  await act(async () => {})
  expect(screen.queryByText('Bring your friends')).toBeNull()
  // Control: another account on the same phone still sees it.
  expect(await friendsCardDone('u2')).toBe(false)
})

it('a share that went somewhere retires it; a cancelled share keeps it', async () => {
  mockShare.mockResolvedValueOnce(false)
  await render(<FriendsCard userId="u1" />)
  await act(async () => fireEvent.press(await screen.findByLabelText('Share my link')))
  expect(screen.getByText('Bring your friends')).toBeTruthy()
  expect(await friendsCardDone('u1')).toBe(false)

  mockShare.mockResolvedValueOnce(true)
  await act(async () => fireEvent.press(screen.getByLabelText('Share my link')))
  await waitFor(() => expect(screen.queryByText('Bring your friends')).toBeNull())
  expect(await friendsCardDone('u1')).toBe(true)
})

it('nothing before the stored answer is read (no flash for someone who dismissed it)', async () => {
  await AsyncStorage.setItem('blendn.friendsCard.done.u1', '1')
  await render(<FriendsCard userId="u1" />)
  await act(async () => {})
  expect(screen.queryByText('Bring your friends')).toBeNull()
})
