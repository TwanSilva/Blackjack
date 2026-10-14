import { type Card, type Pip, PIPS, cardPip } from '../cards';

/** A card counting system is pure data: a count value for every card value. New systems are added as data. */
export interface CountSystem {
  id: string;
  name: string;
  /** Count value per strategy value (1 = Ace, 10 = any ten-valued card). */
  values: Readonly<Record<Pip, number>>;
}

export const HI_LO: CountSystem = {
  id: 'hi-lo',
  name: 'Hi-Lo',
  values: { 1: -1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1 },
};

export const COUNT_SYSTEMS: readonly CountSystem[] = [HI_LO];

export function countValue(card: Card, system: CountSystem = HI_LO): number {
  return system.values[cardPip(card)];
}

/** Sum of the count over one 52-card deck. A balanced count sums to 0. */
export function deckSum(system: CountSystem = HI_LO): number {
  let sum = 0;
  for (const p of PIPS) sum += system.values[p] * (p === 10 ? 16 : 4);
  return sum;
}

export function isBalanced(system: CountSystem = HI_LO): boolean {
  return deckSum(system) === 0;
}

/** "+1", "0", "−1": signed numbers the way the trainer shows them. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${-n}`;
  return '0';
}

/** Built from the system's table: "2–6 are +1, 7–9 are 0, 10–A are −1." */
export function systemHint(system: CountSystem = HI_LO): string {
  // Card order as players think of it: 2 up to 10, then the Ace.
  const order: Pip[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
  const name = (p: Pip) => (p === 1 ? 'A' : String(p));
  const groups: { from: Pip; to: Pip; value: number }[] = [];
  for (const p of order) {
    const v = system.values[p];
    const last = groups[groups.length - 1];
    if (last && last.value === v) last.to = p;
    else groups.push({ from: p, to: p, value: v });
  }
  const parts = groups.map((g) => {
    const range = g.from === g.to ? name(g.from) : `${name(g.from)}–${name(g.to)}`;
    return `${range} ${g.from === g.to ? 'is' : 'are'} ${signed(g.value)}`;
  });
  return `${parts.join(', ')}.`;
}
