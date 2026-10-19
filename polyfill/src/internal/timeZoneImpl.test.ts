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

  it('finds the previous transition of instants past the search lookahead', () => {
    // Backward searches that start more than ~3 years after the current date
    // used to restart from that lookahead point, so every later instant got the
    // same transition from around the current year + 3. New York changes its
    // offset twice a year, so the transition before 2100-07-01 is the start of
    // DST in March 2100.
    expect(
      Number(
        queryTimeZone('America/New_York').getTransition(
          BigInt(4_118_083_200) * bigNanoInSec,
          -1,
        )! / bigNanoInSec,
      ),
    ).toBe(4_108_690_800)

    // A zone whose offset stopped changing long ago still finds its last
    // transition (Japan's last DST ended in 1951).
    expect(
      Number(
        queryTimeZone('Asia/Tokyo').getTransition(
          BigInt(4_118_083_200) * bigNanoInSec,
          -1,
        )! / bigNanoInSec,
      ),
    ).toBe(-577_962_000)
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
