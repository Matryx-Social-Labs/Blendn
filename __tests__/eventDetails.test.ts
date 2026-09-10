import { eventDetailBlocks } from '../lib/eventDetails'

/**
 * These are JSON columns, so the transform's real job is refusing rubbish.
 *
 * Every field arrives as `unknown`. The happy path is one test; the rest of
 * this file is the shapes that would otherwise reach a `<Text>` and render
 * "[object Object]" under a heading like "Wheelchair access".
 */
describe('eventDetailBlocks', () => {
  it('builds the blocks an organiser filled in, in reading order', () => {
    const blocks = eventDetailBlocks({
      houseRules: 'Over 18s only after 10pm.',
      cancellationPolicy: 'Free cancellation up to 24 hours before doors.',
      faq: [{ question: 'Is there parking?', answer: 'Yes — free after 7pm.' }],
      accessibilityInfo: { 'Wheelchair access': 'Step-free entrance.' },
      additionalInfo: { Doors: '7pm, first act at 8pm' },
    })

    /*
     * Order is asserted, not just membership. Accessibility leads because it
     * decides whether somebody can come at all; cancellation trails because it
     * is the question you ask once you have decided.
     */
    expect(blocks.map((b) => b.key)).toEqual([
      'accessibility',
      'additional',
      'house-rules',
      'faq',
      'cancellation',
    ])
  })

  it('is empty when the organiser filled in nothing', () => {
    expect(eventDetailBlocks({})).toEqual([])
    expect(eventDetailBlocks(null)).toEqual([])
    expect(eventDetailBlocks(undefined)).toEqual([])
  })

  it('drops a question with no answer', () => {
    /*
     * The dashboard appends an empty Q&A row the moment "Add Q&A" is pressed,
     * so half-filled rows genuinely reach the column. A question with no answer
     * reads as the screen having failed to load it.
     */
    const blocks = eventDetailBlocks({
      faq: [
        { question: 'Is there parking?', answer: 'Yes.' },
        { question: 'What about food?', answer: '   ' },
        { question: '', answer: 'An answer to nothing' },
      ],
    })
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as { items: unknown[] }).items).toEqual([
      { question: 'Is there parking?', answer: 'Yes.' },
    ])
  })

  it('drops pair values that are not strings rather than coercing them', () => {
    /*
     * `String({})` is "[object Object]". Printing that under "Wheelchair
     * access" is worse than printing nothing, because it looks like an answer.
     */
    const blocks = eventDetailBlocks({
      accessibilityInfo: { Ramp: 'Yes', Lift: {}, Toilet: null, '': 'no label' },
    })
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as { pairs: unknown[] }).pairs).toEqual([{ label: 'Ramp', value: 'Yes' }])
  })

  it('survives the wrong JSON shape entirely', () => {
    /*
     * These columns predate the current form. A row holding a string where the
     * form now writes an object must render nothing, not break the event
     * screen — that screen carries the check-in button.
     */
    expect(
      eventDetailBlocks({
        accessibilityInfo: 'wheelchair ok',
        additionalInfo: ['doors at 7'],
        faq: { question: 'not an array' },
        houseRules: 42,
      })
    ).toEqual([])
  })

  it('ignores whitespace-only prose', () => {
    expect(eventDetailBlocks({ houseRules: '   \n  ', cancellationPolicy: '' })).toEqual([])
  })
})
