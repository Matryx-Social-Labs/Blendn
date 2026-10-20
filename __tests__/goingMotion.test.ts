import { readFileSync } from 'fs'
import { join } from 'path'

/*
 * Going's saved-row removal (DS #16, audit F2): the row fades out on quick, the
 * ones below close the gap on M.settle (the system's spring), and undo fades it
 * back over base. Tokens, not the deprecated MOTION_* names or a literal bezier.
 */
const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'going.tsx'), 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('Going’s row reflow', () => {
  it('uses no deprecated MOTION_* name and no literal bezier', () => {
    expect(code).not.toContain('MOTION_DURATION')
    expect(code).not.toMatch(/MOTION_(EASING|SPRING|STAGGER)/)
    expect(code).not.toContain('Easing.bezier(0.77')
    expect(code).not.toMatch(/Easing\.bezier\(\s*[0-9]/)
  })

  it('the reflow is M.settle; the fade out is quick on the exit curve; the fade back is base on the entrance curve', () => {
    expect(code).toContain('const ROW_REFLOW = LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)')
    expect(code).toContain('const ROW_OUT = FadeOut.duration(DURATION.quick).easing(Easing.bezier(...EASING.exit))')
    expect(code).toContain('const ROW_BACK = FadeIn.duration(DURATION.base).easing(Easing.bezier(...EASING.entrance))')
  })

  it('Reduce Motion keeps the list updating without a layout transition', () => {
    expect(code).toContain('itemLayoutAnimation={reduceMotion ? undefined : ROW_REFLOW}')
  })
})
