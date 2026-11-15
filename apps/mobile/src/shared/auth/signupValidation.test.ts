import { validateSignupFields } from './signupValidation'

describe('validateSignupFields', () => {
  it('accepts a valid phone, email and password', () => {
    expect(
      validateSignupFields({ phone: '01712345678', email: 'a@b.co', password: 'longenough' }),
    ).toEqual({})
  })

  it('names each failing field', () => {
    expect(validateSignupFields({ phone: '123', email: 'a@', password: 'short' })).toEqual({
      phone: 'errors.phoneInvalid',
      email: 'errors.emailInvalid',
      password: 'auth.passwordTooShort',
    })
  })

  it('accepts Bangla digits in the phone', () => {
    expect(validateSignupFields({ phone: '০১৭১২৩৪৫৬৭৮' })).toEqual({})
  })

  it('only checks the fields it is given', () => {
    expect(validateSignupFields({ email: 'bad' })).toEqual({ email: 'errors.emailInvalid' })
  })
})
