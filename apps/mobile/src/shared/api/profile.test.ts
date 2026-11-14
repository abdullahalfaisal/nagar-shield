import { AppError } from '@nagar-shield/shared'
import { setAlternatePhone } from '@/shared/api/profile'

/**
 * The alternate phone's write path.
 *
 * Two rules matter here, and both are the sort of thing that is easy to get
 * subtly wrong:
 *
 *   1. the value is **normalised** before it is written, because the
 *      database's CHECK constraint (migration 020) only accepts E.164 — the
 *      local format the app's own placeholder invites would be refused;
 *
 *   2. an empty value **clears** the column rather than storing an empty
 *      string, because the column is nullable and "no alternate number" is a
 *      legitimate state the user must be able to return to.
 *
 * The mock is at the Supabase client, not at `updateProfile`. A mock of the
 * module's own export would not intercept the call — `setAlternatePhone`
 * calls the module-local function directly — and a test that does not
 * exercise the real write is worth nothing here.
 */

const mockUpdate = jest.fn()
const mockEq = jest.fn()
const mockSelect = jest.fn()

jest.mock('@/shared/api/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args)
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs)
            return {
              select: (...selectArgs: unknown[]) => {
                mockSelect(...selectArgs)
                return {
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: '11111111-1111-1111-1111-111111111101' },
                    error: null,
                  }),
                }
              },
            }
          },
        }
      },
    })),
  },
  secureStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}))

const USER_ID = '11111111-1111-1111-1111-111111111101'

describe('setAlternatePhone', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('normalises a local number to E.164 before writing it', async () => {
    await setAlternatePhone(USER_ID, '01711-111111')

    expect(mockUpdate).toHaveBeenCalledWith({ alternate_phone: '+8801711111111' })
    expect(mockEq).toHaveBeenCalledWith('id', USER_ID)
  })

  it('writes an already-canonical number unchanged', async () => {
    await setAlternatePhone(USER_ID, '+8801711111111')

    expect(mockUpdate).toHaveBeenCalledWith({ alternate_phone: '+8801711111111' })
  })

  it('clears the column for an empty value', async () => {
    await setAlternatePhone(USER_ID, '   ')

    expect(mockUpdate).toHaveBeenCalledWith({ alternate_phone: null })
  })

  it('clears the column for an explicit null', async () => {
    await setAlternatePhone(USER_ID, null)

    expect(mockUpdate).toHaveBeenCalledWith({ alternate_phone: null })
  })

  it('refuses a non-Bangladesh number without writing it', async () => {
    await expect(setAlternatePhone(USER_ID, '+14155550123')).rejects.toThrow(AppError)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuses a number that is too short without writing it', async () => {
    await expect(setAlternatePhone(USER_ID, '12345')).rejects.toThrow(AppError)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refuses a non-number without writing it', async () => {
    await expect(setAlternatePhone(USER_ID, 'my landline')).rejects.toThrow(AppError)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
