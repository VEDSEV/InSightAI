export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  integer(minimum: number, maximum: number): number {
    return Math.floor(this.next() * (maximum - minimum + 1)) + minimum;
  }

  weighted<T>(values: readonly T[], getWeight: (value: T) => number): T {
    const totalWeight = values.reduce((sum, value) => sum + Math.max(0, getWeight(value)), 0);

    if (values.length === 0 || totalWeight <= 0) {
      throw new Error("A weighted selection requires at least one positive weight.");
    }

    let cursor = this.next() * totalWeight;
    for (const value of values) {
      cursor -= Math.max(0, getWeight(value));
      if (cursor <= 0) {
        return value;
      }
    }

    return values.at(-1) as T;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = this.integer(0, index);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }
}

export function deriveSeed(seed: number, streamName: string): number {
  let hash = 0x811c9dc5 ^ seed;
  for (const character of streamName) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
