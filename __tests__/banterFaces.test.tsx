/*
 * The Banter's faces, drawn (owner F1 B, D1 A, 2026-11-14): a named person with no photo is their initial, with a photo
 * the photo, and only the anonymous are creatures — on the row, the request card and the Requests facepile alike.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)

/* eslint-disable import/first */
import { BanterRow, RequestFace } from '../components/banter/BanterParts'
import { BanterRequestsRow } from '../components/banter/BanterRequestsRow'
/* eslint-enable import/first */

const hidden = { includeHiddenElements: true }
const line = { kind: 'text', text: 'Start chatting' } as const

describe('the Banter row', () => {
  it('a revealed person with no photo is their initial', async () => {
    await render(<BanterRow face={{ kind: 'person', named: true, name: 'Audit Host 09', photo: null }} title="Audit Host 09" line={line} time="12m" unread={false} muted={false} />)
    expect(screen.getByText('A', hidden)).toBeTruthy()
  })

  it('an unrevealed match is their creature: no letter', async () => {
    await render(<BanterRow face={{ kind: 'person', named: false, name: 'Rustic Lark', photo: null }} title="Rustic Lark" line={line} time="12m" unread={false} muted={false} />)
    expect(screen.queryByText('R', hidden)).toBeNull()
  })
})

describe('Requests', () => {
  it('a request card from a named sender with no photo draws the initial', async () => {
    await render(<RequestFace photo={null} name="Kavya Raman" />)
    expect(screen.getByText('K', hidden)).toBeTruthy()
  })

  it("a Lobby ask's asker is anonymous: their creature, no letter", async () => {
    await render(<RequestFace pseudonym="Rustic Lark" />)
    expect(screen.queryByText('R', hidden)).toBeNull()
  })

  it('the facepile draws the photo for one and the initial for the other', async () => {
    const requests = [
      { request_id: 'r1', sender_name: 'Aditi Verma', sender_avatar: 'https://x/a.jpg' },
      { request_id: 'r2', sender_name: 'Kavya Raman', sender_avatar: null },
    ]
    await render(<BanterRequestsRow requests={requests} total={2} />)
    expect(screen.getByText('K', hidden)).toBeTruthy()
    // The photo loads over Aditi's own initial (SCRUM-1088), never a creature.
    expect(screen.getByText('A', hidden)).toBeTruthy()
  })
})
