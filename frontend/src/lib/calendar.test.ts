import { describe, expect, it } from 'vitest'
import { addMonths, firstDay, lastDay, monthGrid, monthOf } from './calendar'

describe('calendar', () => {
  it('reads and steps months across years', () => {
    expect(monthOf('2019-07-28')).toEqual({ year: 2019, month: 6 })
    expect(addMonths({ year: 2019, month: 11 }, 1)).toEqual({ year: 2020, month: 0 })
    expect(addMonths({ year: 2020, month: 0 }, -1)).toEqual({ year: 2019, month: 11 })
    expect(addMonths({ year: 2019, month: 6 }, -12)).toEqual({ year: 2018, month: 6 })
  })

  it("gives a month's first and last day", () => {
    expect(firstDay({ year: 2019, month: 6 })).toBe('2019-07-01')
    expect(lastDay({ year: 2020, month: 1 })).toBe('2020-02-29')
  })

  it('lays a month out in six weeks from Monday', () => {
    // July 2019 started on a Monday.
    const july = monthGrid({ year: 2019, month: 6 })
    expect(july).toHaveLength(42)
    expect(july[0]).toEqual({ day: '2019-07-01', inMonth: true })
    expect(july[30]).toEqual({ day: '2019-07-31', inMonth: true })
    expect(july[31]).toEqual({ day: '2019-08-01', inMonth: false })
    // February 2019 started on a Friday: Monday 28 January comes first.
    expect(monthGrid({ year: 2019, month: 1 })[0]).toEqual({ day: '2019-01-28', inMonth: false })
  })
})
