import { biometricCopyFor, remainingBiometricAttempts } from '@/shared/auth/biometricCopy'

describe('remainingBiometricAttempts', () => {
  it('counts down from three, not up', () => {
    expect(remainingBiometricAttempts(0)).toBe(3)
    expect(remainingBiometricAttempts(1)).toBe(2)
    expect(remainingBiometricAttempts(2)).toBe(1)
  })

  it('never goes negative', () => {
    expect(remainingBiometricAttempts(3)).toBe(0)
    expect(remainingBiometricAttempts(5)).toBe(0)
  })
})

describe('biometricCopyFor', () => {
  it('uses face copy and icon for face unlock', () => {
    expect(biometricCopyFor('facial')).toEqual({
      promptKey: 'auth.biometricPromptFace',
      failedKey: 'auth.biometricFailedFace',
      icon: 'face',
    })
  })

  it('uses fingerprint copy for a fingerprint or an unknown kind', () => {
    expect(biometricCopyFor('fingerprint').icon).toBe('fingerprint')
    expect(biometricCopyFor(null).promptKey).toBe('auth.biometricPrompt')
  })
})
