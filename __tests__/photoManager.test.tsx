/**
 * The photo grid talks through the app's toasts and its one sheet, not
 * `Alert.alert` (a light system box on a dark app).
 *
 * Upload results are toasts, in sentence case; removing a photo asks on the
 * sheet first, writes the profile, and only then deletes the file. And no
 * screen or component raises an `Alert.alert` any more.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ActionSheet, Sheet } from '../lib/sheet'

const mockShowToast = jest.fn()
jest.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }))
const mockShowSheet = jest.fn<void, [Sheet]>()
jest.mock('../lib/sheet', () => ({ showSheet: (s: Sheet) => mockShowSheet(s) }))
jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../lib/photoUtils', () => ({
  cachePhoto: jest.fn(async () => null),
  deletePhoto: jest.fn(async () => undefined),
  getUserPhotos: jest.fn(),
  reorderPhotos: jest.fn(),
  selectAndUploadPhoto: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const photoUtils = require('../lib/photoUtils') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PhotoManager = require('../components/PhotoManager').default

const photo = (n: number) => ({ id: `p${n}`, url: `https://cdn/p${n}.jpg`, order: n, isPrimary: n === 0 })

async function mount(count: number, maxPhotos?: number) {
  photoUtils.getUserPhotos.mockResolvedValue(Array.from({ length: count }, (_, i) => photo(i)))
  await render(<PhotoManager userId="u1" maxPhotos={maxPhotos} />)
  await waitFor(() => expect(screen.queryByText('Loading photos...')).toBeNull())
}

describe('PhotoManager', () => {
  it('says a refused upload in a toast, in sentence case', async () => {
    photoUtils.selectAndUploadPhoto.mockResolvedValue({ success: false, error: 'Upload failed with status 502' })
    await mount(1)
    await fireEvent.press(screen.getByLabelText('Add photo'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Couldn't upload that photo. Try again.", 'error'))
    expect(mockShowSheet).not.toHaveBeenCalled()
  })

  it("passes the picker's own sentence through, finished", async () => {
    photoUtils.selectAndUploadPhoto.mockResolvedValue({ success: false, error: 'Photo must be less than 5MB' })
    await mount(1)
    await fireEvent.press(screen.getByLabelText('Add photo'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Photo must be less than 5MB.', 'error'))
  })

  it('stays quiet when the picker is cancelled', async () => {
    photoUtils.selectAndUploadPhoto.mockResolvedValue({ success: false, cancelled: true, error: 'cancelled' })
    await mount(1)
    await fireEvent.press(screen.getByLabelText('Add photo'))
    await waitFor(() => expect(photoUtils.selectAndUploadPhoto).toHaveBeenCalled())
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('a failed profile write after upload takes the tile back and says why', async () => {
    photoUtils.selectAndUploadPhoto.mockResolvedValue({ success: true, url: 'https://cdn/new.jpg' })
    photoUtils.reorderPhotos.mockResolvedValue({ ok: false, error: 'That looks like a blank image.' })
    await mount(1)
    await fireEvent.press(screen.getByLabelText('Add photo'))
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('That looks like a blank image.', 'error'))
    expect(screen.queryByLabelText(/Photo 2 of 2/)).toBeNull()
  })

  it('asks on the sheet before removing, then writes the profile before deleting the file', async () => {
    photoUtils.reorderPhotos.mockResolvedValue({ ok: true })
    await mount(2)
    await fireEvent.press(screen.getByLabelText('Remove photo 2'))

    expect(mockShowSheet).toHaveBeenCalledTimes(1)
    const sheet = mockShowSheet.mock.calls[0][0] as ActionSheet
    expect(sheet.title).toBe('Remove this photo?')
    expect(sheet.actions.map((a) => [a.label, a.variant ?? null])).toEqual([
      ['Remove photo', 'destructive'],
      ['Cancel', null],
    ])
    // Nothing happens until the sheet is answered.
    expect(photoUtils.reorderPhotos).not.toHaveBeenCalled()

    const remove = sheet.actions[0] as unknown as { then: () => Promise<void> }
    await act(() => remove.then())
    expect(photoUtils.reorderPhotos).toHaveBeenCalledWith('u1', ['https://cdn/p0.jpg'])
    expect(photoUtils.deletePhoto).toHaveBeenCalledWith('https://cdn/p1.jpg')
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('a failed removal keeps the file and says so', async () => {
    photoUtils.reorderPhotos.mockResolvedValue({ ok: false, error: "Couldn't save your photos. Try again." })
    await mount(2)
    await fireEvent.press(screen.getByLabelText('Remove photo 1'))
    const remove = (mockShowSheet.mock.calls[0][0] as ActionSheet).actions[0] as unknown as { then: () => Promise<void> }
    await act(() => remove.then())
    expect(photoUtils.deletePhoto).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't save your photos. Try again.", 'error')
  })

  it('a full grid is an info toast, not a popup', async () => {
    // The add tile is gone at the cap, so the path is reached only by an
    // in-flight tap; the source keeps the line honest.
    const src = readFileSync(join(__dirname, '..', 'components', 'PhotoManager.tsx'), 'utf8')
    expect(src).toContain("showToast(`You can have up to ${maxPhotos} photos.`, 'info')")
  })
})

describe('no Alert.alert in the UI', () => {
  const ROOT = join(__dirname, '..')
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.tsx?$/.test(name)) out.push(p)
    }
    return out
  }

  it('app/ and components/ raise none', () => {
    const offenders = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]
      .filter((p) => /\bAlert\.alert\(/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(ROOT, p))
    expect(offenders).toEqual([])
  })

  it("deleting an event asks on the app's sheet", () => {
    const src = readFileSync(join(ROOT, 'components', 'screens', 'EventDetailScreen.tsx'), 'utf8')
    const body = src.slice(src.indexOf('const handleDeleteEvent'), src.indexOf('const openInMaps'))
    expect(body).toContain('showSheet(')
    expect(body).toContain("title: 'Delete this event?'")
    expect(body).toContain("label: 'Delete event'")
    expect(body).toMatch(/run: async/)
  })
})
