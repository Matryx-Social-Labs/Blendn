/*
 * "No emoji as UI": a category is drawn by its Lucide glyph (`categoryGlyph`) and its name. The server's `categories.icon`
 * emoji stays in the API and is not rendered by the chips that show categories. Source-shaped, because the leak it guards
 * is a template string nobody renders in a test.
 */
import fs from 'fs'
import path from 'path'

import { categoryGlyph } from '../lib/categoryGlyph'

const src = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

describe('category chips draw no emoji', () => {
  it('the interest picker never reads the category’s icon', () => {
    expect(src('components/InterestPicker.tsx')).not.toMatch(/category\.icon|\.icon\}/)
  })

  it('the Pulse filter sheet and the Pulse rail take their glyph from the slug', () => {
    expect(src('components/pulse/FilterControl.tsx')).toContain('categoryGlyph(c.slug)')
    expect(src('components/pulse/PulseSections.tsx')).toContain('categoryGlyph(item.slug)')
  })

  it('categoryGlyph returns a Lucide name, never an emoji', () => {
    for (const slug of ['music', 'nightlife', 'food-drink', 'sports', 'arts-culture', 'tech', 'networking', 'outdoor', 'comedy']) {
      expect(categoryGlyph(slug)).toMatch(/^[a-z0-9-]+$/)
    }
  })
})
