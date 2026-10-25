import { mountRepositionHost, requestReposition, settleReposition } from '../lib/photoReposition'

const PHOTO = { uri: 'file:///a.jpg', width: 4000, height: 3000 }

describe('the reposition question', () => {
  it('with no screen to ask on, it skips: the photo goes on as picked, nothing waits', async () => {
    await expect(requestReposition(PHOTO)).resolves.toEqual({ kind: 'skip' })
  })

  it('resolves to what the person did', async () => {
    const unmount = mountRepositionHost()
    const asked = requestReposition(PHOTO)
    settleReposition({ kind: 'use', rect: { originX: 1, originY: 2, width: 3, height: 4 } })
    await expect(asked).resolves.toEqual({ kind: 'use', rect: { originX: 1, originY: 2, width: 3, height: 4 } })
    unmount()
  })

  it('a second question closes the first as cancelled', async () => {
    const unmount = mountRepositionHost()
    const first = requestReposition(PHOTO)
    const second = requestReposition({ ...PHOTO, uri: 'file:///b.jpg' })
    await expect(first).resolves.toEqual({ kind: 'cancel' })
    settleReposition({ kind: 'again' })
    await expect(second).resolves.toEqual({ kind: 'again' })
    unmount()
  })

  it('the screen going away while it was asked cancels the question', async () => {
    const unmount = mountRepositionHost()
    const asked = requestReposition(PHOTO)
    unmount()
    await expect(asked).resolves.toEqual({ kind: 'cancel' })
  })

  it('answering with nothing asked does nothing', () => {
    expect(() => settleReposition({ kind: 'cancel' })).not.toThrow()
  })
})
