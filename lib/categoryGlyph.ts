import type { IconName } from '../components/ui/Icon'

/**
 * The glyph for a category slug ("no emoji as UI": the server's `categories.icon` emoji is still sent and no longer drawn).
 * A slug with no glyph here gets none: the chip's light alone does the work, and no glyph is invented for it.
 */
const GLYPHS: Record<string, IconName> = {
  music: 'music-2',
  nightlife: 'moon',
  'food-drink': 'utensils',
  sports: 'trophy',
  'arts-culture': 'palette',
  tech: 'cpu',
  networking: 'handshake',
  outdoor: 'mountain',
  comedy: 'mic-vocal',
}

export const categoryGlyph = (slug: string): IconName | undefined => (Object.hasOwn(GLYPHS, slug) ? GLYPHS[slug] : undefined)
