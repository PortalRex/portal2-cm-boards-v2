import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DatePicker } from './date-picker'

const open = () => userEvent.click(screen.getByRole('button', { name: 'Day' }))

describe('DatePicker', () => {
  it("opens on the picked day's month and picks a clicked day", async () => {
    const onChange = vi.fn()
    render(
      <DatePicker value="2019-07-28" min="2013-02-28" max="2026-10-27" onChange={onChange} label="Day" />,
    )
    expect(screen.getByRole('button', { name: 'Day' })).toHaveTextContent('2019-07-28')
    await open()
    expect(screen.getByRole('group', { name: 'July 2019' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2019-07-28' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: '2019-07-04' }))
    expect(onChange).toHaveBeenCalledWith('2019-07-04')
    // Picking closes it.
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('changes month and year without picking a day', async () => {
    const onChange = vi.fn()
    render(
      <DatePicker value="2019-02-15" min="2013-02-28" max="2026-10-27" onChange={onChange} label="Day" />,
    )
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('group', { name: 'March 2019' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /choose a month/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await userEvent.click(screen.getByRole('button', { name: 'Jul' }))
    expect(screen.getByRole('group', { name: 'July 2018' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("can't go or pick outside its days", async () => {
    render(
      <DatePicker
        value={null}
        min="2013-02-28"
        max="2013-03-10"
        onChange={() => {}}
        label="Day"
        placeholder="Today"
      />,
    )
    expect(screen.getByRole('button', { name: 'Day' })).toHaveTextContent('Today')
    await open()
    // Opens on the latest day's month.
    expect(screen.getByRole('group', { name: 'March 2013' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2013-03-11' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('button', { name: '2013-02-27' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '2013-02-28' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })
})
