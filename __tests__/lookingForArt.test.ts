/**
 * The "What brings you" tiles' art (rc7 D1). Dating, Friendship and Networking were 512² renders of an app window: a
 * garbled title bar, window buttons and a letterbox, with the photo in a band in the middle. `contentFit="cover"` on a
 * 112 pt tile shows that frame. They are now the photo alone, cropped at 3:2 (the tile is about 1.35–1.65 wide).
 *
 * No JPEG decoder is installed, so this reads the frame size from the SOF marker: a square file here is the old render.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const CROPPED = ['looking-dating.jpg', 'looking-friendship.jpg', 'looking-networking.jpg']
const TILE_RATIO = { min: 1.35, max: 1.65 }

/** Width and height from the first start-of-frame marker (SOF0–SOF15, not DHT/JPG/DAC). */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  let at = 2
  while (at < bytes.length) {
    const marker = bytes[at + 1]
    const length = bytes.readUInt16BE(at + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) }
    }
    at += 2 + length
  }
  throw new Error('no SOF marker')
}

describe('looking-for art', () => {
  it.each(CROPPED)('%s is the photo cropped to the tile, not the 512² window render', (file) => {
    const { width, height } = jpegSize(readFileSync(join(__dirname, '../assets/onboarding', file)))
    const ratio = width / height
    expect(ratio).toBeGreaterThanOrEqual(TILE_RATIO.min)
    expect(ratio).toBeLessThanOrEqual(TILE_RATIO.max)
  })
})
