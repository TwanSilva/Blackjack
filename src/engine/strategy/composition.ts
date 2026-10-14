/**
 * Shoe composition by strategy value: index 1 = aces, 2..9, 10 = all ten-valued cards. Index 0 is unused.
 */
export type Composition = number[];

export function fullShoe(decks: number): Composition {
  const c = new Array<number>(11).fill(0);
  for (let p = 1; p <= 9; p++) c[p] = 4 * decks;
  c[10] = 16 * decks;
  return c;
}

export function removeCards(comp: Composition, pips: readonly number[]): Composition {
  const out = comp.slice();
  for (const p of pips) {
    if (out[p] <= 0) throw new Error(`No card of value ${p} left in the shoe`);
    out[p]--;
  }
  return out;
}

export function cardsIn(comp: Composition): number {
  let n = 0;
  for (let p = 1; p <= 10; p++) n += comp[p];
  return n;
}

export function probabilities(comp: Composition): number[] {
  const n = cardsIn(comp);
  return comp.map((count, p) => (p === 0 ? 0 : count / n));
}
