import { type Card, RANKS, SUITS } from './cards';

export type Rng = () => number;

export function buildDecks(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  return cards;
}

/** A shoe with a cut card. Dealing past the cut card sets `needsShuffle`; the round in progress can still finish. */
export class Shoe {
  private cards: Card[] = [];
  private next = 0;
  private cutIndex = 0;

  constructor(
    readonly decks: number,
    readonly penetration: number,
    private readonly rng: Rng = Math.random,
  ) {
    if (penetration <= 0 || penetration > 1) throw new Error('Penetration must be between 0 and 1');
    this.shuffle();
  }

  shuffle(): void {
    this.cards = buildDecks(this.decks);
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.next = 0;
    this.cutIndex = Math.round(this.cards.length * this.penetration);
  }

  draw(): Card {
    if (this.next >= this.cards.length) throw new Error('The shoe is empty');
    return this.cards[this.next++];
  }

  get size(): number {
    return this.cards.length;
  }

  get dealt(): number {
    return this.next;
  }

  get remaining(): number {
    return this.cards.length - this.next;
  }

  get decksRemaining(): number {
    return this.remaining / 52;
  }

  get needsShuffle(): boolean {
    return this.next >= this.cutIndex;
  }
}
