export type DoubleOn = 'any' | '9-11' | '10-11';
export type DeckCount = 1 | 2 | 4 | 6 | 8;

export interface Rules {
  decks: DeckCount;
  /** Dealer hits soft 17 (H17) when true, stands (S17) when false. */
  hitSoft17: boolean;
  /** Blackjack payout: 1.5 for 3:2, 1.2 for 6:5. */
  blackjackPays: 1.5 | 1.2;
  doubleAfterSplit: boolean;
  doubleOn: DoubleOn;
  resplitAces: boolean;
  /** Maximum number of hands a player can end up with by splitting. */
  maxSplitHands: number;
  surrender: 'late' | 'none';
  /** US style when true. False is European no-hole-card: a dealer blackjack takes every bet, doubles and splits included. */
  dealerPeeks: boolean;
  /** Fraction of the shoe dealt before the cut card (0.5 to 0.85). Used by the shoe, not by strategy. */
  penetration: number;
}

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  decks: 8,
  hitSoft17: true,
  blackjackPays: 1.5,
  doubleAfterSplit: true,
  doubleOn: 'any',
  resplitAces: false,
  maxSplitHands: 4,
  surrender: 'late',
  dealerPeeks: true,
  penetration: 0.75,
});

export interface RulePreset {
  id: string;
  name: string;
  rules: Rules;
}

export const RULE_PRESETS: readonly RulePreset[] = [
  { id: 'default-h17', name: '8 decks H17', rules: { ...DEFAULT_RULES } },
  { id: 'default-s17', name: '8 decks S17', rules: { ...DEFAULT_RULES, hitSoft17: false } },
  {
    id: 'european',
    name: 'No hole card',
    rules: { ...DEFAULT_RULES, hitSoft17: false, dealerPeeks: false, surrender: 'none' },
  },
];

/** Stable key used for caching computed strategy. Penetration does not change strategy, so it is left out. */
export function strategyKey(r: Rules): string {
  return [
    r.decks, r.hitSoft17 ? 'H17' : 'S17', r.doubleAfterSplit ? 'DAS' : 'NDAS', r.doubleOn,
    r.resplitAces ? 'RSA' : 'NRSA', r.maxSplitHands, r.surrender, r.dealerPeeks ? 'peek' : 'enhc',
  ].join('|');
}

/** Short header summary, for example "H17 · 8 decks · 3:2". */
export function rulesSummary(r: Rules): string {
  return `${r.hitSoft17 ? 'H17' : 'S17'} · ${r.decks} deck${r.decks === 1 ? '' : 's'} · ${r.blackjackPays === 1.5 ? '3:2' : '6:5'}`;
}

/** Full line for the chart subtitle. */
export function rulesDescription(r: Rules): string {
  const parts = [
    r.hitSoft17 ? 'H17' : 'S17',
    `${r.decks} deck${r.decks === 1 ? '' : 's'}`,
    r.blackjackPays === 1.5 ? 'blackjack 3:2' : 'blackjack 6:5',
    r.doubleOn === 'any' ? 'double any two cards' : `double ${r.doubleOn} only`,
    r.doubleAfterSplit ? 'double after split' : 'no double after split',
    r.resplitAces ? 'resplit aces' : 'no resplit aces',
    `split to ${r.maxSplitHands} hands`,
    r.surrender === 'late' ? 'late surrender' : 'no surrender',
    r.dealerPeeks ? 'dealer peeks' : 'no hole card',
  ];
  return parts.join(' · ');
}

export const SIX_TO_FIVE_WARNING =
  '6:5 blackjack takes about 1.4% more of every bet than 3:2. Avoid these tables if you can.';
