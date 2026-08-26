import { EMOJIS } from "../content/data";
import type { Pool } from "./types";

export interface RandomSource {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new Error("무작위 선택 후보가 비어 있습니다.");
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = this.int(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }
}

export function poolEntries(pool: Pool): string[] {
  return Object.entries(pool).flatMap(([id, count]) =>
    EMOJIS[id] ? Array.from({ length: count }, () => id) : [],
  );
}

export function drawFromPool(pool: Pool, count: number, rng: RandomSource): string[] {
  const entries = poolEntries(pool);
  if (entries.length < count) {
    throw new Error(`Emoji가 부족합니다. 필요 ${count}, 보유 ${entries.length}`);
  }
  return rng.shuffle(entries).slice(0, count);
}

export function weightedChoice<T>(
  choices: ReadonlyArray<{ value: T; weight: number }>,
  rng: RandomSource,
): T {
  const total = choices.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng.next() * total;
  for (const item of choices) {
    cursor -= item.weight;
    if (cursor < 0) return item.value;
  }
  return choices[choices.length - 1].value;
}
