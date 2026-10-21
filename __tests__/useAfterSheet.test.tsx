/*
 * A result tray waits for its Sheet to have left the screen: iOS dismisses a
 * modal presented over one still leaving, so "Event updated" / "Couldn't send…"
 * opened in the same tick never showed.
 */
import { act, renderHook } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

import { SHEET_GONE_FALLBACK_MS, useAfterSheet } from '../lib/useAfterSheet'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('useAfterSheet', () => {
  it('runs what waited only once the sheet reports it is gone, and only once', async () => {
    const { result } = await renderHook(() => useAfterSheet())
    const tray = jest.fn()
    await act(async () => result.current.after(tray))
    expect(tray).not.toHaveBeenCalled()
    await act(async () => result.current.dismissed())
    expect(tray).toHaveBeenCalledTimes(1)
    await act(async () => result.current.dismissed())
    await act(async () => void jest.advanceTimersByTime(SHEET_GONE_FALLBACK_MS * 2))
    expect(tray).toHaveBeenCalledTimes(1)
  })

  it('a platform that never reports it gone still shows the tray, after the fallback', async () => {
    const { result } = await renderHook(() => useAfterSheet())
    const tray = jest.fn()
    await act(async () => result.current.after(tray))
    await act(async () => void jest.advanceTimersByTime(SHEET_GONE_FALLBACK_MS - 1))
    expect(tray).not.toHaveBeenCalled()
    await act(async () => void jest.advanceTimersByTime(1))
    expect(tray).toHaveBeenCalledTimes(1)
  })

  it('a dismissal with nothing waiting does nothing; a second wait replaces the first', async () => {
    const { result } = await renderHook(() => useAfterSheet())
    await act(async () => result.current.dismissed())
    const first = jest.fn()
    const second = jest.fn()
    await act(async () => result.current.after(first))
    await act(async () => result.current.after(second))
    await act(async () => result.current.dismissed())
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('nothing runs after the screen is gone', async () => {
    const { result, unmount } = await renderHook(() => useAfterSheet())
    const tray = jest.fn()
    await act(async () => result.current.after(tray))
    await unmount()
    await act(async () => void jest.advanceTimersByTime(SHEET_GONE_FALLBACK_MS * 2))
    expect(tray).not.toHaveBeenCalled()
  })
})

describe('the event screen wires it', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'screens', 'EventDetailScreen.tsx'), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('the two sheets\' results are toasts now, so nothing is opened over a sheet that is still leaving', () => {
    // A toast is not a modal: it needs no wait for the dismissal (iOS drops a modal presented over one that is leaving).
    for (const said of ['Announcement sent.', 'Couldn’t send the announcement. Try again.', 'Event updated.', 'Couldn’t save your changes. Try again.']) {
      expect(code).toContain(`showToast('${said}'`)
    }
    expect(code).not.toContain('afterSheet(')
    expect(code).not.toContain('showTray(')
  })

  it('the announcement’s text survives a failed send and a reopen: only a send that went through clears it', () => {
    const open = code.slice(code.indexOf('const openAnnouncementComposer'), code.indexOf('const { run: sendAnnouncement'))
    expect(open).not.toContain("setAnnouncementText('')")
    const sender = code.slice(code.indexOf('useSingleFlight(async () => {'), code.indexOf('const openEditComposer'))
    expect(sender.match(/setAnnouncementText\(''\)/g)).toHaveLength(1)
    expect(sender.indexOf("setAnnouncementText('')")).toBeLessThan(sender.indexOf('} else {'))
    expect(code).toMatch(/onClose=\{\(\) => setShowAnnouncementModal\(false\)\}/)
  })
})
