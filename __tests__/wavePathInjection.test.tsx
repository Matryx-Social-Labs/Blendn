/**
 * Security review (MEDIUM) on Wave PR (b): `/waves/[eventId]` takes its id from a link, and the id rode unencoded into
 * an authenticated API path. A crafted id (`../users/me`, `a?b`, `%2F`) must never reach a request as path or query;
 * the link is refused at the door; the screen shows the gone state; every id-built API path is encoded once.
 */
import { render, screen } from '@testing-library/react-native'
import fs from 'fs'
import path from 'path'
import React from 'react'

import { nativeIntentPath } from '../lib/shareLinks'

const CRAFTED = ['../users/me', 'a?b', 'a#b', '..%2Fusers', 'a/b']

describe('the API paths built from an id', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
  jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
  jest.mock('expo-secure-store', () => ({ getItemAsync: async () => 'tok', setItemAsync: async () => {}, deleteItemAsync: async () => {} }))
  const { apiClient } = require('../lib/apiClient') as typeof import('../lib/apiClient')
  /* eslint-enable @typescript-eslint/no-require-imports */

  const pathsOf = async (call: () => Promise<unknown>) => {
    const seen: string[] = []
    const spy = jest.spyOn(apiClient, 'queuedRequest').mockImplementation(async (endpoint: string) => {
      seen.push(endpoint)
      return { success: true, data: null } as never
    })
    await call()
    spy.mockRestore()
    return seen
  }

  it.each(CRAFTED)('a crafted id %p stays one encoded segment in the wave reads and the wave', async (id) => {
    const seen = [
      ...(await pathsOf(() => apiClient.getReceivedWaves(id, null))),
      ...(await pathsOf(() => apiClient.sendWave(id, 'rh_x'))),
    ]
    for (const p of seen) {
      const segment = p.replace(/^\/api\/mobile\/events\//, '').replace(/\/waves(\?.*)?$/, '')
      expect(segment).toBe(encodeURIComponent(id))
      expect(p).not.toContain('../')
      expect(p.split('?')[0]).toMatch(/\/waves$/)
    }
  })

  it('control: a real id is unchanged', async () => {
    expect(await pathsOf(() => apiClient.getReceivedWaves('291f7364-6ad6-40a6-9728-8e841b3b94a3', 'c1'))).toEqual([
      '/api/mobile/events/291f7364-6ad6-40a6-9728-8e841b3b94a3/waves?cursor=c1',
    ])
  })

  it('no API path in apiClient interpolates a bare id: each goes through pathSegment', () => {
    const src = fs.readFileSync(path.join(__dirname, '../lib/apiClient.ts'), 'utf8')
    const bare = src
      .split('\n')
      .filter((l) => l.includes('/api/mobile'))
      .flatMap((l) => [...l.matchAll(/\$\{(\w+(?:\.\w+)?)\}/g)].map((m) => m[1]))
      .filter((name) => /(Id|id)$/.test(name))
    expect(bare).toEqual([])
  })
})

describe('the link', () => {
  it.each(CRAFTED.map((id) => `blendn://waves/${id}`))('%p never reaches the waves screen with that id', (url) => {
    // Refused, or (a query or fragment being no part of a path) the one checked id before it, and nothing after.
    const routed = nativeIntentPath(url)
    expect(routed).toMatch(/^\/$|^\/waves\/[A-Za-z0-9_-]{1,64}$/)
    expect(routed).not.toMatch(/users|%2F|\.\.|\/b$/)
  })

  it('control: a real id passes, and nothing else rides along', () => {
    expect(nativeIntentPath('blendn://waves/291f7364-6ad6-40a6-9728-8e841b3b94a3?title=x')).toBe('/waves/291f7364-6ad6-40a6-9728-8e841b3b94a3')
  })
})

describe('the screen', () => {
  const mockParams: { eventId?: string } = {}
  const mockGet = jest.fn(async () => ({ success: true, data: { open: true, total: 0, waves: [], nextCursor: null } }))
  jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => mockParams, useNavigation: () => null, useFocusEffect: () => {} }))
  jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default)
  jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }))
  jest.mock('../components/ds/Sheet', () => ({ Sheet: ({ children }: { children: React.ReactNode }) => children }))

  it.each(CRAFTED)('a crafted id %p shows the gone state and asks the server nothing', async (id) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { apiClient } = require('../lib/apiClient') as typeof import('../lib/apiClient')
    const Screen = require('../app/waves/[eventId]').default as React.ComponentType
    /* eslint-enable @typescript-eslint/no-require-imports */
    const spy = jest.spyOn(apiClient, 'getReceivedWaves').mockImplementation(mockGet as never)
    mockParams.eventId = id
    await render(<Screen />)
    expect(screen.getByText('This room isn’t available.')).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('control: a real id loads its list', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { apiClient } = require('../lib/apiClient') as typeof import('../lib/apiClient')
    const Screen = require('../app/waves/[eventId]').default as React.ComponentType
    /* eslint-enable @typescript-eslint/no-require-imports */
    const spy = jest.spyOn(apiClient, 'getReceivedWaves').mockImplementation(mockGet as never)
    mockParams.eventId = '291f7364-6ad6-40a6-9728-8e841b3b94a3'
    await render(<Screen />)
    expect(spy).toHaveBeenCalledWith('291f7364-6ad6-40a6-9728-8e841b3b94a3', null)
    expect(screen.queryByText('This room isn’t available.')).toBeNull()
    spy.mockRestore()
  })
})
