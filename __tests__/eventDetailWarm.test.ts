import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * A card's press-in warms the event page into the client cache. It only helps
 * if the page then asks for the same key: warmEvent sent lat/lon, the page did
 * not, so every warm was a wasted request and every open still waited on its own.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
}))
const mockSecure = new Map<string, string>()
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockSecure.set(k, v)
  },
  deleteItemAsync: async (k: string) => {
    mockSecure.delete(k)
  },
}))
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))
jest.mock('../lib/logger', () => ({
  Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test'
/* eslint-disable @typescript-eslint/no-require-imports */
const { apiClient, TokenStorage } = require('../lib/apiClient') as typeof import('../lib/apiClient')
const { EVENT_DETAIL_QUERY } = require('../lib/eventDetailQuery') as typeof import('../lib/eventDetailQuery')
/* eslint-enable @typescript-eslint/no-require-imports */

const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

it('the warm and the page read are one request: the second is served from the first', async () => {
  await TokenStorage.setAccessToken('tok')
  const urls: string[] = []
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input))
    return new Response(JSON.stringify({ success: true, data: { id: 'e1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  await apiClient.getEvent('e1', { ...EVENT_DETAIL_QUERY })
  await apiClient.getEvent('e1', { ...EVENT_DETAIL_QUERY })

  expect(urls).toHaveLength(1)
})

describe('every caller that warms the page, and the page, use the same query', () => {
  it.each([
    ['app/(tabs)/events.tsx'],
    ['app/nearby-events.tsx'],
    ['components/screens/EventDetailScreen.tsx'],
  ])('%s', (file) => {
    const src = read(file)
    expect(src).toContain('...EVENT_DETAIL_QUERY')
    const call = src.slice(src.indexOf('.getEvent('), src.indexOf('.getEvent(') + 160)
    expect(call).not.toMatch(/\blat\b|\blon\b/)
  })
})
