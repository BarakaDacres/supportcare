/**
 * Rate resolution — resolves effective PayRates for a given client.
 *
 * Priority:
 *  1. Client custom rate (if use_custom_rates && field has value)
 *  2. Global default rates from user settings
 *  3. Hardcoded DEFAULT_RATES fallback
 */

import type { PayRates } from '@/lib/shiftCalculator';
import { DEFAULT_RATES } from '@/lib/shiftCalculator';

export interface ClientRateFields {
  use_custom_rates: boolean;
  rate_weekday: number | null;
  rate_saturday: number | null;
  rate_sunday: number | null;
  rate_evening: number | null;
  rate_sleepover_weekday: number | null;
  rate_sleepover_weekend: number | null;
  rate_sleepover_public_holiday?: number | null;
  rate_public_holiday: number | null;
  rate_overtime?: number | null;
}

/**
 * Resolve effective rates for a client, falling back field-by-field.
 */
export function getEffectiveRates(
  client: ClientRateFields | null | undefined,
  globalRates?: Partial<PayRates>,
): PayRates {
  const base: PayRates = {
    rate_weekday:           globalRates?.rate_weekday           ?? DEFAULT_RATES.rate_weekday,
    rate_saturday:          globalRates?.rate_saturday          ?? DEFAULT_RATES.rate_saturday,
    rate_sunday:            globalRates?.rate_sunday            ?? DEFAULT_RATES.rate_sunday,
    rate_evening:           globalRates?.rate_evening           ?? DEFAULT_RATES.rate_evening,
    rate_sleepover_weekday: globalRates?.rate_sleepover_weekday ?? DEFAULT_RATES.rate_sleepover_weekday,
    rate_sleepover_weekend: globalRates?.rate_sleepover_weekend ?? DEFAULT_RATES.rate_sleepover_weekend,
    rate_sleepover_public_holiday: globalRates?.rate_sleepover_public_holiday ?? DEFAULT_RATES.rate_sleepover_public_holiday,
    rate_public_holiday:    globalRates?.rate_public_holiday    ?? DEFAULT_RATES.rate_public_holiday,
    rate_overtime:          globalRates?.rate_overtime          ?? DEFAULT_RATES.rate_overtime,
  };

  if (!client || !client.use_custom_rates) return base;

  return {
    rate_weekday:           client.rate_weekday           ?? base.rate_weekday,
    rate_saturday:          client.rate_saturday          ?? base.rate_saturday,
    rate_sunday:            client.rate_sunday            ?? base.rate_sunday,
    rate_evening:           client.rate_evening           ?? base.rate_evening,
    rate_sleepover_weekday: client.rate_sleepover_weekday ?? base.rate_sleepover_weekday,
    rate_sleepover_weekend: client.rate_sleepover_weekend ?? base.rate_sleepover_weekend,
    rate_sleepover_public_holiday: client.rate_sleepover_public_holiday ?? base.rate_sleepover_public_holiday,
    rate_public_holiday:    client.rate_public_holiday    ?? base.rate_public_holiday,
    rate_overtime:          client.rate_overtime          ?? base.rate_overtime,
  };
}
