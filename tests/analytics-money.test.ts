// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  addDays,
  addMoneyCents,
  daysBetween,
  daysInMonth,
  endOfMonth,
  formatMoneyCents,
  isLeapYear,
  isoDate,
  moneyCents,
  multiplyMoneyCents,
  parseMoneyCents,
  rateMetricValue,
  rational,
  roundRationalToBasisPoints,
  roundRationalToScaledInteger,
  shiftMonthsClamped,
  shiftYearsClamped,
  startOfMonth,
  subtractMoneyCents,
  sumMoneyCents,
} from "@/analytics";

function parsedCents(input: string): number {
  const result = parseMoneyCents(input);
  if (result.status === "error") {
    throw new Error(`Expected ${input} to parse: ${result.errors.map((error) => error.message)}`);
  }
  return result.value;
}

describe("decimal-safe money primitives", () => {
  it.each([
    ["0", 0],
    ["12", 1_200],
    ["12.3", 1_230],
    ["12.34", 1_234],
    ["+12.30", 1_230],
    ["-0.00", 0],
  ])("normalizes %s to exact integer cents", (input, expected) => {
    expect(parsedCents(input)).toBe(expected);
  });

  it.each([
    ["1.001", "invalid_money"],
    ["1e2", "invalid_money"],
    ["1,000.00", "invalid_money"],
    ["NaN", "invalid_money"],
    ["Infinity", "invalid_money"],
    [" 1.00 ", "invalid_money"],
    ["90071992547409.92", "unsafe_integer"],
  ])("rejects non-authoritative money input %s", (input, expectedCode) => {
    const result = parseMoneyCents(input, "amount");
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.errors.map((error) => error.code)).toContain(expectedCode);
      expect(result.errors[0]).toMatchObject({ field: "amount", value: input });
    }
  });

  it("parses signed primitive money while preserving negative derived amounts", () => {
    expect(parsedCents("-1.23")).toBe(-123);

    const grossProfit = subtractMoneyCents(moneyCents(800), moneyCents(1_000));
    const contribution = addMoneyCents(grossProfit, moneyCents(-75));

    expect(grossProfit).toBe(-200);
    expect(contribution).toBe(-275);
    expect(formatMoneyCents(contribution)).toBe("-2.75");
  });

  it("accumulates and multiplies many large cent values exactly", () => {
    const lineValue = moneyCents(123_456_789);
    const expected = 6_172_839_450_000;

    expect(multiplyMoneyCents(lineValue, 50_000)).toBe(expected);
    expect(sumMoneyCents(Array<ReturnType<typeof moneyCents>>(50_000).fill(lineValue))).toBe(
      expected,
    );
  });

  it("rejects unsafe primitive values and arithmetic overflow", () => {
    expect(() => moneyCents(1.5)).toThrow(/safe integer/u);
    expect(() => addMoneyCents(moneyCents(Number.MAX_SAFE_INTEGER), moneyCents(1))).toThrow(
      /safe integer/u,
    );
    expect(() => multiplyMoneyCents(moneyCents(Number.MAX_SAFE_INTEGER), 2)).toThrow(
      /safe-integer range/u,
    );
    expect(() => sumMoneyCents([moneyCents(Number.MAX_SAFE_INTEGER), moneyCents(1)])).toThrow(
      /safe integer/u,
    );
  });
});

describe("exact rate representation and boundary rounding", () => {
  it("rounds halfway values symmetrically away from zero", () => {
    expect(roundRationalToScaledInteger(rational(1, 8), 100)).toBe(13);
    expect(roundRationalToScaledInteger(rational(-1, 8), 100)).toBe(-13);
    expect(roundRationalToBasisPoints(rational(1, 3))).toBe(3_333);
    expect(roundRationalToBasisPoints(rational(-1, 3))).toBe(-3_333);
  });

  it("preserves exact ratios while rounding percentage boundaries only for serialization", () => {
    expect(rateMetricValue(0, 15)).toEqual({
      kind: "rate",
      ratio: { numerator: 0, denominator: 1 },
      basisPoints: 0,
    });
    expect(rateMetricValue(1, 20_000)).toMatchObject({
      ratio: { numerator: 1, denominator: 20_000 },
      basisPoints: 1,
    });
    expect(rateMetricValue(-1, 20_000).basisPoints).toBe(-1);
    expect(rateMetricValue(1, 20_001).basisPoints).toBe(0);
    expect(rateMetricValue(3, 2)).toMatchObject({
      ratio: { numerator: 3, denominator: 2 },
      basisPoints: 15_000,
    });
    expect(() => rational(1, 0)).toThrow(/denominator/u);
  });
});

describe("civil-date arithmetic", () => {
  it("handles leap years and month lengths without date rollover", () => {
    expect(isLeapYear(2_000)).toBe(true);
    expect(isLeapYear(1_900)).toBe(false);
    expect(isLeapYear(2_024)).toBe(true);
    expect(daysInMonth(2_024, 2)).toBe(29);
    expect(daysInMonth(2_023, 2)).toBe(28);
    expect(addDays(isoDate("2024-02-28"), 1)).toBe("2024-02-29");
    expect(addDays(isoDate("2024-02-29"), 1)).toBe("2024-03-01");
    expect(() => isoDate("2023-02-29")).toThrow(/valid YYYY-MM-DD/u);
  });

  it("clamps month and year shifts at valid civil boundaries", () => {
    expect(startOfMonth(isoDate("2024-02-29"))).toBe("2024-02-01");
    expect(endOfMonth(isoDate("2024-02-12"))).toBe("2024-02-29");
    expect(shiftMonthsClamped(isoDate("2024-01-31"), 1)).toBe("2024-02-29");
    expect(shiftMonthsClamped(isoDate("2024-03-31"), -1)).toBe("2024-02-29");
    expect(shiftYearsClamped(isoDate("2024-02-29"), -1)).toBe("2023-02-28");
  });

  it("uses UTC civil days across daylight-saving transitions", () => {
    expect(addDays(isoDate("2024-03-09"), 1)).toBe("2024-03-10");
    expect(addDays(isoDate("2024-03-09"), 2)).toBe("2024-03-11");
    expect(daysBetween(isoDate("2024-03-09"), isoDate("2024-03-11"))).toBe(2);
    expect(addDays(isoDate("2024-11-02"), 2)).toBe("2024-11-04");
    expect(daysBetween(isoDate("2024-11-02"), isoDate("2024-11-04"))).toBe(2);
  });
});
