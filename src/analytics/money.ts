import { createAnalyticsError } from "./errors.ts";
import type {
  AnalyticsResult,
  BasisPoints,
  MoneyCents,
  RateMetricValue,
  Rational,
} from "./types.ts";

const MONEY_PATTERN = /^[+-]?\d+(?:\.\d{1,2})?$/;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const ONE_HUNDRED = BigInt(100);
const TWO = BigInt(2);
const TEN_THOUSAND = 10_000;

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function safeBigIntToNumber(value: bigint, label: string): number {
  if (value > MAX_SAFE_BIGINT || value < MIN_SAFE_BIGINT) {
    throw new RangeError(`${label} exceeds the safe-integer range.`);
  }
  return Number(value);
}

export function moneyCents(value: number): MoneyCents {
  return requireSafeInteger(value, "Money cents") as MoneyCents;
}

export function basisPoints(value: number): BasisPoints {
  return requireSafeInteger(value, "Basis points") as BasisPoints;
}

export function parseMoneyCents(input: string, field = "money"): AnalyticsResult<MoneyCents> {
  if (!MONEY_PATTERN.test(input)) {
    return {
      status: "error",
      errors: [
        createAnalyticsError({
          code: "invalid_money",
          stage: "row_validation",
          message: `${field} must be a plain decimal with at most two fractional digits.`,
          field,
          value: input,
        }),
      ],
    };
  }

  const negative = input.startsWith("-");
  const unsigned = input.startsWith("-") || input.startsWith("+") ? input.slice(1) : input;
  const [wholePart, fractionalPart = ""] = unsigned.split(".");
  const paddedFraction = fractionalPart.padEnd(2, "0");

  try {
    const unsignedCents = BigInt(wholePart) * ONE_HUNDRED + BigInt(paddedFraction || "0");
    const signedCents = negative ? -unsignedCents : unsignedCents;
    if (signedCents > MAX_SAFE_BIGINT || signedCents < MIN_SAFE_BIGINT) {
      return {
        status: "error",
        errors: [
          createAnalyticsError({
            code: "unsafe_integer",
            stage: "row_validation",
            message: `${field} exceeds the supported safe-integer cent range.`,
            field,
            value: input,
          }),
        ],
      };
    }

    return {
      status: "ok",
      value: moneyCents(Number(signedCents)),
      warnings: [],
    };
  } catch {
    return {
      status: "error",
      errors: [
        createAnalyticsError({
          code: "invalid_money",
          stage: "row_validation",
          message: `${field} is not a valid decimal amount.`,
          field,
          value: input,
        }),
      ],
    };
  }
}

export function addMoneyCents(left: MoneyCents, right: MoneyCents): MoneyCents {
  return moneyCents(requireSafeInteger(left + right, "Money addition"));
}

export function subtractMoneyCents(left: MoneyCents, right: MoneyCents): MoneyCents {
  return moneyCents(requireSafeInteger(left - right, "Money subtraction"));
}

export function multiplyMoneyCents(value: MoneyCents, multiplier: number): MoneyCents {
  requireSafeInteger(multiplier, "Money multiplier");
  const product = BigInt(value) * BigInt(multiplier);
  return moneyCents(safeBigIntToNumber(product, "Money multiplication"));
}

export function sumMoneyCents(values: readonly MoneyCents[]): MoneyCents {
  let total = moneyCents(0);
  for (const value of values) {
    total = addMoneyCents(total, value);
  }
  return total;
}

export function formatMoneyCents(value: MoneyCents): string {
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fractional = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fractional}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export function rational(numerator: number, denominator: number): Rational {
  requireSafeInteger(numerator, "Rational numerator");
  requireSafeInteger(denominator, "Rational denominator");
  if (denominator === 0) {
    throw new RangeError("Rational denominator must not be zero.");
  }

  if (numerator === 0) {
    return Object.freeze({ numerator: 0, denominator: 1 });
  }

  const normalizedNumerator = denominator < 0 ? -numerator : numerator;
  const normalizedDenominator = Math.abs(denominator);
  const divisor = greatestCommonDivisor(normalizedNumerator, normalizedDenominator);
  return Object.freeze({
    numerator: normalizedNumerator / divisor,
    denominator: normalizedDenominator / divisor,
  });
}

export function roundRationalToScaledInteger(value: Rational, scale: number): number {
  requireSafeInteger(value.numerator, "Rational numerator");
  requireSafeInteger(value.denominator, "Rational denominator");
  requireSafeInteger(scale, "Rational scale");
  if (value.denominator === 0) {
    throw new RangeError("Rational denominator must not be zero.");
  }
  if (scale < 0) {
    throw new RangeError("Rational scale must be non-negative.");
  }

  const normalized = rational(value.numerator, value.denominator);
  const negative = normalized.numerator < 0;
  const absoluteNumerator = BigInt(Math.abs(normalized.numerator));
  const denominator = BigInt(normalized.denominator);
  const scaledNumerator = absoluteNumerator * BigInt(scale);
  let quotient = scaledNumerator / denominator;
  const remainder = scaledNumerator % denominator;
  if (remainder * TWO >= denominator) {
    quotient += BigInt(1);
  }

  const signed = negative ? -quotient : quotient;
  return safeBigIntToNumber(signed, "Rounded rational");
}

export function roundRationalToBasisPoints(value: Rational): BasisPoints {
  return basisPoints(roundRationalToScaledInteger(value, TEN_THOUSAND));
}

export function rateMetricValue(numerator: number, denominator: number): RateMetricValue {
  const ratio = rational(numerator, denominator);
  return Object.freeze({
    kind: "rate",
    ratio,
    basisPoints: roundRationalToBasisPoints(ratio),
  });
}

export function compareRationals(left: Rational, right: Rational): -1 | 0 | 1 {
  const normalizedLeft = rational(left.numerator, left.denominator);
  const normalizedRight = rational(right.numerator, right.denominator);
  const leftProduct = BigInt(normalizedLeft.numerator) * BigInt(normalizedRight.denominator);
  const rightProduct = BigInt(normalizedRight.numerator) * BigInt(normalizedLeft.denominator);
  if (leftProduct < rightProduct) {
    return -1;
  }
  if (leftProduct > rightProduct) {
    return 1;
  }
  return 0;
}
