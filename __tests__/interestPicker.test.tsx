/*
 * The interest picker draws each category by its name only: the server's `icon` emoji is no longer UI ("no emoji as UI"),
 * and the children carry no glyph.
 */
import { render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import { InterestPicker } from '../components/InterestPicker'
import { apiClient } from '../lib/apiClient'

jest.mock('../lib/apiClient', () => ({ apiClient: { getCategories: jest.fn() } }))

const TREE = [
  { id: 'm', name: 'Music', icon: '🎵', children: [{ id: 'm1', name: 'Jazz', icon: '🎷' }, { id: 'm2', name: 'Techno', icon: '🎧' }] },
  { id: 'f', name: 'Food & Drink', icon: '🍕', children: [{ id: 'f1', name: 'Street food', icon: '🌮' }] },
]

describe('<InterestPicker>', () => {
  it('no rendered label contains the server’s emoji, and each reads its name', async () => {
    ;(apiClient.getCategories as jest.Mock).mockResolvedValue({ success: true, data: TREE })
    await render(<InterestPicker selected={[]} onChange={jest.fn()} />)
    await waitFor(() => expect(screen.getByText('Jazz')).toBeTruthy())
    const shown = JSON.stringify(screen.toJSON())
    for (const emoji of ['🎵', '🎷', '🎧', '🍕', '🌮']) expect(shown).not.toContain(emoji)
    for (const name of ['Jazz', 'Techno', 'Street food']) expect(screen.getByText(name)).toBeTruthy()
  })

  it('a chip is the multi + / ✓ slot, with no leading glyph of its own', async () => {
    ;(apiClient.getCategories as jest.Mock).mockResolvedValue({ success: true, data: TREE })
    await render(<InterestPicker selected={['m1']} onChange={jest.fn()} />)
    await waitFor(() => expect(screen.getByText('Jazz')).toBeTruthy())
    expect(screen.getByTestId('interests-m-m1-slot')).toBeTruthy()
    expect(screen.getByTestId('interests-m-m1-check-glyph', { includeHiddenElements: true })).toBeTruthy()
  })
})
