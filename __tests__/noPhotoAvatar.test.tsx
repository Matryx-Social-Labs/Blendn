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
  it.each([['empty string', ''], ['empty uri', { uri: '' }]])('does not spin for an %s', async (_label, source) => {
    await render(<OptimizedImage source={source as never} width={48} height={48} />)
    expect(screen.queryByLabelText('Loading image')).toBeNull()
  })

  it('still spins while a real image loads', async () => {
    await render(<OptimizedImage source="https://example.com/a.jpg" width={48} height={48} />)
    expect(screen.getByLabelText('Loading image')).toBeTruthy()
  })
})

describe('the Banter row', () => {
  /*
   * Since the Flow 5 redesign there is one avatar family: a person is their
   * photo or, with none, their creature (the DS Avatar). Never an image with
   * an empty source.
   */
  it('draws the creature, never an image, for a person with no photo', () => {
    const src = read('components', 'banter', 'BanterParts.tsx')
    expect(src).not.toMatch(/source=\{\{ uri: [^}]*\?\? ''/)
    expect(src).toContain('face.photo ? <Avatar size={ROW_AVATAR} kind="photo" uri={face.photo} /> : <Avatar size={ROW_AVATAR} kind="creature" pseudonym={face.pseudonym} />')
  })

  it('the DM header draws them the same way', () => {
    const src = read('app', 'private-chat', '[conversationId].tsx')
    // directHeaderAvatar decides (socialPolish.test.ts); "initials" draws the creature.
    expect(src).toContain('directHeaderAvatar(reveal, otherImage,')
    expect(src).toContain("head?.kind === 'photo' ? { kind: 'photo', uri: head.url } : { kind: 'creature'")
  })
})
