/*
 * A person with no photo is their creature, not a spinner.
 *
 * The Banter handed `OptimizedImage` an empty source for everyone who had not
 * set a photo, and `OptimizedImage` showed its spinner until an image loaded or
 * failed — an empty source does neither, so it spun for ever. Four of the
 * owner's six conversations on 2026-09-28 (SCRUM-404).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import React from 'react'
import { render, screen } from '@testing-library/react-native'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../lib/apiClient', () => ({ apiClient: {}, TokenStorage: {} }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))

// eslint-disable-next-line import/first
import { OptimizedImage } from '../components/OptimizedImage'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('OptimizedImage with nothing to load', () => {
  // The placeholder is a still shape hidden from screen readers (DS #17), so it is found by testID, not a label.
  it.each([['empty string', ''], ['empty uri', { uri: '' }]])('draws no placeholder for an %s', async (_label, source) => {
    await render(<OptimizedImage source={source as never} width={48} height={48} />)
    expect(screen.queryByTestId('image-placeholder', { includeHiddenElements: true })).toBeNull()
  })

  it('draws the placeholder while a real image loads', async () => {
    await render(<OptimizedImage source="https://example.com/a.jpg" width={48} height={48} />)
    expect(screen.getByTestId('image-placeholder', { includeHiddenElements: true })).toBeTruthy()
  })
})

describe('every Banter face goes through personFace (F1 B: a creature means anonymous)', () => {
  // The rule itself is personFace.test.ts; these pin that each surface asks it rather than choosing its own face.
  it.each([
    ['the Banter row', ['components', 'banter', 'BanterParts.tsx'], 'personFace({ named: face.named'],
    ['the request card', ['components', 'banter', 'BanterParts.tsx'], 'personFace({ named: true'],
    ['the Requests facepile', ['components', 'banter', 'BanterRequestsRow.tsx'], 'personFace({ named: true'],
    ['the DM header', ['lib', 'directThread.ts'], 'personFace({'],
  ])('%s', (_surface, file, call) => {
    const src = read(...file)
    expect(src).toContain(call)
    expect(src).not.toMatch(/source=\{\{ uri: [^}]*\?\? ''/)
  })

  it('the Named card in event preferences is your initial with no photo, never the outline user glyph (SCRUM-1078)', () => {
    const src = read('app', 'event-preferences', '[eventId].tsx')
    expect(src).toContain('personFace({ named: true')
    expect(src).not.toMatch(/icon=\{[^}]*'user'/)
  })

  it('the DM screen draws the header and your own face from the same rule', () => {
    const src = read('app', 'private-chat', '[conversationId].tsx')
    expect(src).toContain('directHeaderAvatar(reveal, otherImage, name)')
    expect(src).toContain('reveal?.youRevealed ? personFace({ named: true')
  })
})
