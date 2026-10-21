export class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  between(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(values: readonly T[]): T {
    const value = values[this.int(0, values.length - 1)];
    if (value === undefined) throw new Error('Cannot pick from empty values');
    return value;
  }
}
