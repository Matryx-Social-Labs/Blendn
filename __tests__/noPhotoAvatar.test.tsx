/*
 * A person with no photo is initials, not a spinner.
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
// eslint-disable-next-line import/first
import { initialsOf } from '../lib/initials'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('OptimizedImage with nothing to load', () => {
  it.each([['empty string', ''], ['empty uri', { uri: '' }]])('does not spin for an %s', async (_label, source) => {
    await render(<OptimizedImage source={source as never} width={48} height={48} />)
    expect(screen.queryByLabelText('Loading image')).toBeNull()
  })

  it('still spins while a real image loads', async () => {
    await render(<OptimizedImage source="https://example.com/a.jpg" width={48} height={48} />)
    expect(screen.getByLabelText('Loading image')).toBeTruthy()
  })
})

describe('initialsOf', () => {
  it.each([
    ['Vikram Shetty', 'VS'],
    ['vishruth', 'V'],
    ['  Anna  Maria  Lopez ', 'AL'],
    ['', '?'],
  ])('%s → %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })
})

describe('the Banter row', () => {
  it('draws initials, never an image, for a person with no photo', () => {
    const src = read('components', 'banter', 'BanterSections.tsx')
    expect(src).not.toMatch(/source=\{item\.avatarUrl \?\? ''\}/)
    expect(src).toMatch(/initialsOf\(/)
  })

  it('the DM header uses the same initials', () => {
    const src = read('app', 'private-chat', '[conversationId].tsx')
    expect(src).not.toMatch(/const getInitials =/)
    expect(src).toMatch(/initialsOf\(/)
  })
})
