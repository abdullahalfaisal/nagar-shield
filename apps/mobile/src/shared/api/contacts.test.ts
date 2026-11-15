import { deleteContact, failingContactFields, makePrimary } from './contacts'
import { supabase } from '@/shared/api/supabase'

jest.mock('@/shared/api/supabase', () => ({
  supabase: { from: jest.fn(), auth: { getSession: jest.fn() } },
}))

const from = supabase.from as jest.Mock

type Call = { op: string; args: unknown[] }

/** A chainable stand-in that records every call and resolves with `result`. */
function builder(calls: Call[], result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const op of ['update', 'delete', 'eq', 'neq', 'select', 'order']) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args })
      return chain
    }
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? [], error: result.error ?? null }).then(resolve)
  return chain
}

describe('makePrimary', () => {
  it('sets the new primary first, then clears the others in one statement', async () => {
    const calls: Call[] = []
    from.mockImplementation(() => builder(calls, {}))

    await makePrimary('x')

    expect(from).toHaveBeenCalledTimes(2)
    expect(calls[0]).toEqual({ op: 'update', args: [{ is_primary: true }] })
    expect(calls).toContainEqual({ op: 'update', args: [{ is_primary: false }] })
    expect(calls).toContainEqual({ op: 'neq', args: ['id', 'x'] })
    // The first write comes before the clearing one.
    const promoteAt = calls.findIndex((c) => c.op === 'update')
    const clearAt = calls.findIndex(
      (c) => c.op === 'update' && (c.args[0] as { is_primary: boolean }).is_primary === false,
    )
    expect(promoteAt).toBeLessThan(clearAt)
  })

  it('does not clear anyone when setting the new primary fails', async () => {
    const calls: Call[] = []
    from.mockReset()
    from.mockImplementationOnce(() => builder(calls, { error: { message: 'boom', code: '500' } }))

    await expect(makePrimary('x')).rejects.toBeTruthy()
    expect(from).toHaveBeenCalledTimes(1)
  })
})

describe('deleteContact', () => {
  it('still succeeds when re-densifying the sort order fails', async () => {
    const calls: Call[] = []
    from.mockReset()
    // 1: the delete succeeds; 2: the densify read fails.
    from.mockImplementationOnce(() => builder(calls, {}))
    from.mockImplementationOnce(() => builder(calls, { error: { message: 'down', code: '500' } }))

    await expect(deleteContact('x')).resolves.toBeUndefined()
  })

  it('still fails when the delete itself fails', async () => {
    from.mockReset()
    from.mockImplementationOnce(() => builder([], { error: { message: 'no', code: '500' } }))

    await expect(deleteContact('x')).rejects.toBeTruthy()
  })
})

describe('failingContactFields', () => {
  it('flags every failing field, not just the first', () => {
    expect(failingContactFields({ name: '', phone: '123' })).toEqual({ name: true, phone: true })
    expect(failingContactFields({ name: 'Rahim', phone: '123' })).toEqual({
      name: false,
      phone: true,
    })
    expect(failingContactFields({ name: 'Rahim', phone: '01712-345678' })).toEqual({
      name: false,
      phone: false,
    })
  })
})
