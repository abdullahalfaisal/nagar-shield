import { useEffect, useState } from 'react'

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'night'

/**
 * The part of the day for each hour of the device's local clock (0 – 23):
 *
 *   05:00 – 11:59  morning
 *   12:00 – 16:59  afternoon (noon and after)
 *   17:00 – 19:59  evening
 *   20:00 – 04:59  night
 *
 * A table rather than comparisons, so the boundaries can be read at a glance.
 */
const PERIOD_BY_HOUR: readonly GreetingPeriod[] = [
  'night',
  'night',
  'night',
  'night',
  'night', // 00 – 04
  'morning',
  'morning',
  'morning',
  'morning',
  'morning',
  'morning',
  'morning', // 05 – 11
  'afternoon',
  'afternoon',
  'afternoon',
  'afternoon',
  'afternoon', // 12 – 16
  'evening',
  'evening',
  'evening', // 17 – 19
  'night',
  'night',
  'night',
  'night', // 20 – 23
]

export function greetingPeriod(date: Date): GreetingPeriod {
  return PERIOD_BY_HOUR[date.getHours()] ?? 'night'
}

/** The i18n key for a period's greeting. */
export const GREETING_KEYS = {
  morning: 'home.greetingMorning',
  afternoon: 'home.greetingAfternoon',
  evening: 'home.greetingEvening',
  night: 'home.greetingNight',
} as const satisfies Record<GreetingPeriod, string>

/** The Material icon that suits a period. */
/** The same four periods as line icons, for the redesigned Home header. */
export const GREETING_LINE_ICONS = {
  morning: 'sun',
  afternoon: 'sun',
  evening: 'sunset',
  night: 'moon',
} as const satisfies Record<GreetingPeriod, 'sun' | 'sunset' | 'moon'>

export const GREETING_ICONS = {
  morning: 'wb_sunny',
  afternoon: 'wb_sunny',
  evening: 'wb_twilight',
  night: 'bedtime',
} as const satisfies Record<GreetingPeriod, string>

/**
 * The current period, kept fresh while the screen is open: it re-checks every
 * minute, so a screen left open across 12:00 or 20:00 changes its greeting
 * without a reload.
 */
export function useGreetingPeriod(): GreetingPeriod {
  const [period, setPeriod] = useState<GreetingPeriod>(() => greetingPeriod(new Date()))

  useEffect(() => {
    const timer = setInterval(() => setPeriod(greetingPeriod(new Date())), 60_000)
    return () => clearInterval(timer)
  }, [])

  return period
}
