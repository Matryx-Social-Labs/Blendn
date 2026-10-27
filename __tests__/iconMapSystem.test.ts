/** SYS-13: the frames' names for four glyphs resolve (trash-2 is Lucide 1.x's `trash`). */
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(__dirname, '..', 'components/ui/Icon.tsx'), 'utf8')

it.each([
  ["'trash-2'", 'Trash2'],
  ['locate', 'Locate'],
  ["'image-off'", 'ImageOff'],
  ['store', 'Store'],
])('maps %s', (key, component) => {
  expect(src).toMatch(new RegExp(`^  ${key}: ${component},$`, 'm'))
  expect(src).toContain(`import ${component} from 'lucide-react-native/icons/`)
})
