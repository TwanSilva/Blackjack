import { BUST } from './dealerModel';

/** Player hands are tracked as (sum with aces counted as 1, holds an ace). */
export function effectiveTotal(sum: number, hasAce: boolean): number {
  return hasAce && sum + 10 <= 21 ? sum + 10 : sum;
}

/** EV of standing on `total` against a dealer final-total distribution. */
export function standEv(total: number, final: readonly number[]): number {
  if (total > 21) return -1;
  let ev = final[BUST];
  for (let i = 0; i < 5; i++) {
    const d = 17 + i;
    if (d < total) ev += final[i];
    else if (d > total) ev -= final[i];
  }
  return ev;
}

/** Expected values for standing, hitting and doubling, per unit of the original bet. */
export class PlayerEv {
  private readonly hitMemo = new Map<number, number>();

  constructor(
    private readonly q: readonly number[],
    private readonly final: readonly number[],
  ) {}

  stand(sum: number, hasAce: boolean): number {
    return standEv(effectiveTotal(sum, hasAce), this.final);
  }

  /** Hit once, then keep playing the better of hit and stand. */
  hit(sum: number, hasAce: boolean): number {
    const key = sum * 2 + (hasAce ? 1 : 0);
    const cached = this.hitMemo.get(key);
    if (cached !== undefined) return cached;
    let ev = 0;
    for (let r = 1; r <= 10; r++) {
      const p = this.q[r];
      if (p === 0) continue;
      const ns = sum + r;
      if (ns > 21) {
        ev -= p;
      } else {
        const na = hasAce || r === 1;
        ev += p * Math.max(this.stand(ns, na), this.hit(ns, na));
      }
    }
    this.hitMemo.set(key, ev);
    return ev;
  }

  /** Double the bet and take exactly one card. */
  double(sum: number, hasAce: boolean): number {
    let ev = 0;
    for (let r = 1; r <= 10; r++) {
      const p = this.q[r];
      if (p === 0) continue;
      const ns = sum + r;
      ev += p * (ns > 21 ? -1 : this.stand(ns, hasAce || r === 1));
    }
    return 2 * ev;
  }

  /** Probability that one more card busts the hand. */
  bustOnHit(sum: number): number {
    let p = 0;
    for (let r = 1; r <= 10; r++) if (sum + r > 21) p += this.q[r];
    return p;
  }
}
