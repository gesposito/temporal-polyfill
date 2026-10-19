import { describe, expect, it } from 'vitest'
import { bigNanoInSec } from './bigNano'
import { maxMilli } from './temporalConstants'
import { queryTimeZone } from './timeZone'

describe('queryTimeZone', () => {
  it('finds close-together transitions without hiding the in-between offset', () => {
    const timeZone = queryTimeZone('Africa/Tunis')

    // Africa/Tunis changed from +02:00 to +01:00 on 1943-04-17, then back to
    // +02:00 just over eight days later. A broad endpoint-only period can see
    // +02:00 at both ends and incorrectly assume that the +01:00 interval never
    // existed. That is especially dangerous because getOffsetNanosecondsFor()
    // feeds ordinary Temporal wall-clock/DST-gap math, not only public
    // transition queries.
    expect(
      timeZone.getOffsetNanosecondsFor(BigInt(-842_916_600) * bigNanoInSec),
    ).toBe(3_600_000_000_000)

    expect(
      Number(
        timeZone.getTransition(BigInt(-842_920_200) * bigNanoInSec, 1)! /
          bigNanoInSec,
      ),
    ).toBe(-842_918_400)

    expect(
      Number(
        timeZone.getTransition(BigInt(-842_916_600) * bigNanoInSec, -1)! /
          bigNanoInSec,
      ),
    ).toBe(-842_918_400)
  })

  it('finds the transitions of 1844, the earliest in the time zone database', () => {
    // Asia/Manila and Pacific/Guam (with Saipan, Palau and Kosrae) moved across
    // the date line on 1844-12-31. Transition searches used to start at
    // 1847-01-01 and never saw these.
    const manila = queryTimeZone('Asia/Manila')
    const from1800 = BigInt(-5_364_662_400) * bigNanoInSec
    const from1846 = BigInt(-3_913_056_000) * bigNanoInSec
    const transitionSec = Number(
      manila.getTransition(from1800, 1)! / bigNanoInSec,
    )

    // 1844-12-31T15:56:00Z, or 15:56:08Z with time zone data that gives Manila's
    // local mean time to the second (-15:56:08)
    expect(transitionSec).toBeGreaterThanOrEqual(-3_944_621_040)
    expect(transitionSec).toBeLessThanOrEqual(-3_944_621_032)
    expect(Number(manila.getTransition(from1846, -1)! / bigNanoInSec)).toBe(
      transitionSec,
    )
    expect(
      Number(
        queryTimeZone('Pacific/Guam').getTransition(from1800, 1)! /
          bigNanoInSec,
      ),
    ).toBe(-3_944_626_740)
  })

  it('samples offsets near TimeClip boundaries without asking Intl for out-of-range dates', () => {
    const timeZone = queryTimeZone('America/Vancouver')
    const maxEpochNano = BigInt(maxMilli) * 1_000_000n

    // Offset lookup samples both ends of a search period. At the Temporal
    // instant limits, one endpoint can sit outside native Intl's Date range
    // even though the requested instant itself is valid.
    expect(() => {
      timeZone.getOffsetNanosecondsFor(-maxEpochNano)
      timeZone.getOffsetNanosecondsFor(maxEpochNano)
      timeZone.getTransition(maxEpochNano, 1)
      timeZone.getTransition(maxEpochNano, -1)
    }).not.toThrow()
  })

  it('samples pre-modern named-zone offsets without asking Intl for BCE fields', () => {
    const timeZone = queryTimeZone('America/Vancouver')

    // This is the local-mean-time offset expected before North American
    // standard-time zones. Some host Intl implementations return unreliable
    // BCE date fields for the actual ancient instant, so the offset sampler
    // clamps far-past dates to a safer pre-modern sample point.
    expect(
      timeZone.getOffsetNanosecondsFor(BigInt(-93_314_917_968) * bigNanoInSec),
    ).toBe(-29_548_000_000_000)
  })
})
