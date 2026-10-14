export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
/** Strategy value of a card: 1 = Ace, 10 = any ten-valued card. */
export type Pip = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const PIPS: readonly Pip[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const RANK_NAMES: Record<Rank, string> = {
  A: 'Ace', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven',
  '8': 'Eight', '9': 'Nine', '10': 'Ten', J: 'Jack', Q: 'Queen', K: 'King',
};

export function pipOf(rank: Rank): Pip {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K' || rank === '10') return 10;
  return Number(rank) as Pip;
}

export function cardPip(card: Card): Pip {
  return pipOf(card.rank);
}

/** Screen-reader name, for example "Ten of spades". */
export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} of ${card.suit}`;
}

export function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/** "Ace", "10", "6": how a dealer card is named in prose. */
export function pipName(pip: Pip): string {
  return pip === 1 ? 'Ace' : String(pip);
}

/** "an Ace", "an 8", "a 6". */
export function pipWithArticle(pip: Pip): string {
  return pip === 1 || pip === 8 ? `an ${pipName(pip)}` : `a ${pipName(pip)}`;
}
