import { type Action, type HandContext, ACTION_LABEL, availableActions } from '../actions';
import { type Card, cardPip, pipName } from '../cards';
import { CountTracker, type TrueCountRounding } from '../counting/count';
import { signed } from '../counting/systems';
import { playDealer } from '../dealer';
import { handValue, isBlackjack } from '../hand';
import { type Settlement, settleHand, settleInsurance } from '../payout';
import type { Rules } from '../rules';
import { type Rng, Shoe } from '../shoe';
import { type BetGrade, type BetSpread, gradeBet, maxUnits } from '../betting/spread';
import { mistakeCost } from '../strategy/reasons';
import { bestPlay } from '../strategy/oracle';

/** What the table needs from a shoe. The real Shoe fits; tests can pass a stacked one. */
export interface ShoeLike {
  draw(): Card;
  shuffle(): void;
  readonly needsShuffle: boolean;
  readonly remaining: number;
}

export interface TableConfig {
  rules: Rules;
  spread: BetSpread;
  unitPotatoes: number;
  bankroll: number;
  /** Other players at the table, 0 to 4. They sit before you, play basic strategy and bet one unit. */
  others: number;
  rounding: TrueCountRounding;
  rng?: Rng;
  shoe?: ShoeLike;
}

export type TablePhase = 'betting' | 'insurance' | 'playing' | 'roundOver' | 'broke';

export interface TableHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  surrendered: boolean;
  done: boolean;
  settlement?: Settlement;
}

export interface TableSeat {
  name: string;
  hero: boolean;
  hands: TableHand[];
  insurance: number;
}

export type TableEvent =
  | { kind: 'card'; seat: number | 'dealer'; hand: number; card: Card; hidden?: boolean }
  | { kind: 'reveal'; card: Card }
  | { kind: 'action'; seat: number; hand: number; action: Action }
  | { kind: 'shuffle' }
  | { kind: 'settled' };

export interface DecisionRecord {
  kind: 'play' | 'insurance' | 'bet' | 'count';
  correct: boolean;
  chosen: string;
  best: string;
  /** "Hard 16 vs 10 at +2". */
  situation: string;
  trueCount: number;
  /** EV lost per 100 bet, when it can be measured (basic strategy decisions). */
  costPer100: number | null;
  /** Plain explanation shown in the summary. */
  note: string;
  ms?: number;
  hinted?: boolean;
}

export interface RoundResult {
  round: number;
  bet: number;
  net: number;
  trueCountAtBet: number;
}

const OTHER_NAMES = ['Ana', 'Rui', 'Marta', 'João'];
/** Losing rounds in a row before the tilt guard watches decisions. */
export const TILT_LOSING_STREAK = 3;

function emptyHand(bet: number): TableHand {
  return { cards: [], bet, doubled: false, fromSplit: false, splitAces: false, surrendered: false, done: false };
}

/**
 * A full blackjack table with a real shoe and cut card. You sit last ("third base"), so every other player's
 * cards are on the table when you decide. Every decision you make is graded against the strategy engine at the
 * current true count; bets are graded against your spread.
 */
export class TableGame {
  readonly rules: Rules;
  readonly spread: BetSpread;
  readonly unit: number;
  readonly rounding: TrueCountRounding;
  readonly startingBankroll: number;
  private readonly shoe: ShoeLike;
  private readonly tracker: CountTracker;

  bankroll: number;
  phase: TablePhase = 'betting';
  seats: TableSeat[];
  dealer: Card[] = [];
  holeRevealed = false;
  /** Index of your hand being played. */
  active = 0;
  round = 0;
  readonly decisions: DecisionRecord[] = [];
  readonly results: RoundResult[] = [];
  private events: TableEvent[] = [];
  private losingStreak = 0;
  private tiltShown = false;
  private betTrueCount = 0;
  private lastBetGrade: BetGrade | null = null;

  constructor(cfg: TableConfig) {
    this.rules = cfg.rules;
    this.spread = cfg.spread;
    this.unit = cfg.unitPotatoes;
    this.rounding = cfg.rounding;
    this.bankroll = cfg.bankroll;
    this.startingBankroll = cfg.bankroll;
    this.shoe = cfg.shoe ?? new Shoe(cfg.rules.decks, cfg.rules.penetration, cfg.rng);
    this.tracker = new CountTracker(cfg.rules.decks);
    const others = Math.max(0, Math.min(4, cfg.others));
    this.seats = [
      ...Array.from({ length: others }, (_, i) => ({ name: OTHER_NAMES[i], hero: false, hands: [], insurance: 0 })),
      { name: 'You', hero: true, hands: [], insurance: 0 },
    ];
  }

  // ---------- Reading the table ----------

  get hero(): TableSeat {
    return this.seats[this.seats.length - 1];
  }
  get heroIndex(): number {
    return this.seats.length - 1;
  }
  get upcard(): Card | undefined {
    return this.dealer[0];
  }
  /** The running count of every card you have seen (the hole card only once it is turned over). */
  get runningCount(): number {
    return this.tracker.running;
  }
  get trueCount(): number {
    return this.tracker.trueCount(this.rounding);
  }
  get cardsLeft(): number {
    return this.shoe.remaining;
  }
  get lastBet(): BetGrade | null {
    return this.lastBetGrade;
  }

  /** Card and action events since the last call, for the UI to animate. */
  drainEvents(): TableEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- Dealing helpers ----------

  private draw(seat: number | 'dealer', hand: number, hidden = false): Card {
    const card = this.shoe.draw();
    if (!hidden) this.tracker.see(card);
    this.events.push({ kind: 'card', seat, hand, card, hidden });
    return card;
  }

  private ctx(h: TableHand, seat: TableSeat): HandContext {
    return { fromSplit: h.fromSplit, hands: seat.hands.length, splitAces: h.splitAces };
  }

  private committed(): number {
    return this.hero.hands.reduce((s, h) => s + h.bet, 0) + this.hero.insurance;
  }

  // ---------- Betting ----------

  /** Bet sizes you can choose, in units: from 1 up to the spread's maximum, limited by your bankroll. */
  betOptions(): number[] {
    const max = Math.min(maxUnits(this.spread), Math.floor(this.bankroll / this.unit));
    return Array.from({ length: Math.max(0, max) }, (_, i) => i + 1);
  }

  placeBet(units: number): void {
    if (this.phase !== 'betting') throw new Error('Not taking bets now');
    if (!this.betOptions().includes(units)) throw new Error('That bet is not allowed');
    this.round++;
    this.betTrueCount = this.trueCount;
    const g = gradeBet(this.spread, this.betTrueCount, units, this.unit);
    this.lastBetGrade = g;
    this.decisions.push({
      kind: 'bet', correct: g.verdict === 'right', chosen: `${units}`, best: `${g.expectedUnits}`,
      situation: `Bet at ${signed(this.betTrueCount)}`, trueCount: this.betTrueCount, costPer100: null, note: g.explanation,
    });
    for (const s of this.seats) {
      s.hands = [emptyHand(s.hero ? units * this.unit : this.unit)];
      s.insurance = 0;
    }
    this.dealer = [];
    this.holeRevealed = false;
    this.active = 0;
    for (let pass = 0; pass < 2; pass++) {
      this.seats.forEach((s, i) => s.hands[0].cards.push(this.draw(i, 0)));
      this.dealer.push(this.draw('dealer', 0, pass === 1));
    }
    if (cardPip(this.dealer[0]) === 1) {
      this.phase = 'insurance';
      return;
    }
    this.afterInsurance();
  }

  // ---------- Insurance and the peek ----------

  insuranceAnswer(): { best: boolean; note: string } {
    const a = bestPlay(this.hero.hands[0].cards, this.dealer[0], this.rules, { value: this.trueCount, rounding: this.rounding });
    const ins = a.insurance!;
    if (ins.take === null) return { best: false, note: `${ins.warning} Basic strategy never takes insurance.` };
    return {
      best: ins.take,
      note: `Insurance: take it at a true count of +${ins.index} or higher. The count is ${signed(this.trueCount)}, so ${ins.take ? 'take it' : 'decline it'}.`,
    };
  }

  insurance(take: boolean, ms?: number): void {
    if (this.phase !== 'insurance') throw new Error('Insurance is not on offer');
    const ans = this.insuranceAnswer();
    this.decisions.push({
      kind: 'insurance', correct: take === ans.best, chosen: take ? 'take' : 'decline', best: ans.best ? 'take' : 'decline',
      situation: `Insurance at ${signed(this.trueCount)}`, trueCount: this.trueCount, costPer100: null, note: ans.note, ms,
    });
    const half = this.hero.hands[0].bet / 2;
    if (take && this.bankroll - this.committed() >= half) this.hero.insurance = half;
    this.afterInsurance();
  }

  private dealerHasBlackjack(): boolean {
    return isBlackjack(this.dealer);
  }

  private revealHole(): void {
    if (this.holeRevealed) return;
    this.holeRevealed = true;
    this.tracker.see(this.dealer[1]);
    this.events.push({ kind: 'reveal', card: this.dealer[1] });
  }

  private afterInsurance(): void {
    const up = cardPip(this.dealer[0]);
    if (this.rules.dealerPeeks && (up === 1 || up === 10) && this.dealerHasBlackjack()) {
      this.revealHole();
      this.settle();
      return;
    }
    // Others play first, then you.
    for (let i = 0; i < this.heroIndex; i++) this.playOther(i);
    this.phase = 'playing';
    this.active = 0;
    this.skipFinishedHands();
  }

  // ---------- Other players: basic strategy, one unit, no splits ----------

  private playOther(i: number): void {
    const seat = this.seats[i];
    const h = seat.hands[0];
    if (isBlackjack(h.cards)) { h.done = true; return; }
    for (;;) {
      const allowed: Action[] = availableActions(h.cards, this.rules, this.ctx(h, seat)).filter((a) => a !== 'split');
      const advice = bestPlay(h.cards, this.dealer[0], this.rules, undefined, this.ctx(h, seat));
      const action = allowed.includes(advice.best) ? advice.best : advice.options.find((o) => allowed.includes(o.action))!.action;
      this.events.push({ kind: 'action', seat: i, hand: 0, action });
      if (action === 'stand') break;
      if (action === 'surrender') { h.surrendered = true; break; }
      if (action === 'double') { h.bet *= 2; h.doubled = true; h.cards.push(this.draw(i, 0)); break; }
      h.cards.push(this.draw(i, 0));
      if (handValue(h.cards).total >= 21) break;
    }
    h.done = true;
  }

  // ---------- Your decisions ----------

  /** Actions you can take on the active hand, given the rules and what you can afford. */
  allowedActions(): Action[] {
    if (this.phase !== 'playing') return [];
    const h = this.hero.hands[this.active];
    let acts = availableActions(h.cards, this.rules, this.ctx(h, this.hero));
    const spare = this.bankroll - this.committed();
    if (spare < h.bet) acts = acts.filter((a) => a !== 'double' && a !== 'split');
    return acts;
  }

  /** The engine's play for the active hand at the current true count. */
  advice() {
    const h = this.hero.hands[this.active];
    return bestPlay(h.cards, this.dealer[0], this.rules, { value: this.trueCount, rounding: this.rounding }, this.ctx(h, this.hero));
  }

  /** A short hint: the best play and why, from the engine. */
  hint(): string {
    const a = this.advice();
    const rows = a.count?.applied ?? [];
    const why = rows.length ? ` (count index: ${rows.map((r) => r.row.id).join(', ')})` : '';
    return `Best play: ${ACTION_LABEL[a.best].toLowerCase()}${why}.`;
  }

  decide(action: Action, ms?: number, hinted = false): void {
    if (this.phase !== 'playing') throw new Error('Not your turn');
    if (!this.allowedActions().includes(action)) throw new Error(`${action} is not allowed here`);
    const h = this.hero.hands[this.active];
    const a = this.advice();
    const usesCount = (a.count?.applied.length ?? 0) > 0;
    const right = action === a.best;
    const situation = `${h.cards.length > 2 ? `${a.handLabel} (${h.cards.length} cards)` : a.handLabel} vs ${pipName(cardPip(this.dealer[0]))} at ${signed(this.trueCount)}`;
    const note = usesCount
      ? `At ${signed(this.trueCount)} the count index says ${ACTION_LABEL[a.best].toLowerCase()} (basic strategy: ${ACTION_LABEL[a.basicBest].toLowerCase()}).`
      : `Basic strategy: ${ACTION_LABEL[a.best].toLowerCase()}.`;
    this.decisions.push({
      kind: 'play', correct: right, chosen: action, best: a.best, situation, trueCount: this.trueCount,
      costPer100: !usesCount && !right ? mistakeCost(a, action).lossPer100 : null, note, ms, hinted,
    });
    this.apply(action);
  }

  private apply(action: Action): void {
    const seat = this.hero;
    const hi = this.heroIndex;
    const h = seat.hands[this.active];
    this.events.push({ kind: 'action', seat: hi, hand: this.active, action });
    switch (action) {
      case 'hit':
        h.cards.push(this.draw(hi, this.active));
        if (handValue(h.cards).total >= 21) h.done = true;
        break;
      case 'stand':
        h.done = true;
        break;
      case 'double':
        h.bet *= 2;
        h.doubled = true;
        h.cards.push(this.draw(hi, this.active));
        h.done = true;
        break;
      case 'surrender':
        h.surrendered = true;
        h.done = true;
        break;
      case 'split': {
        const aces = cardPip(h.cards[0]) === 1;
        const second: TableHand = { ...emptyHand(h.bet), cards: [h.cards.pop()!], fromSplit: true, splitAces: aces };
        h.fromSplit = true;
        h.splitAces = aces;
        seat.hands.splice(this.active + 1, 0, second);
        h.cards.push(this.draw(hi, this.active));
        if (aces && !(this.rules.resplitAces && cardPip(h.cards[1]) === 1)) h.done = true;
        break;
      }
    }
    this.skipFinishedHands();
  }

  /** Moves to the next hand that needs a decision, dealing split hands their second card; ends your turn. */
  private skipFinishedHands(): void {
    const seat = this.hero;
    for (;;) {
      if (this.active >= seat.hands.length) { this.dealerTurn(); return; }
      const h = seat.hands[this.active];
      if (h.cards.length === 1) {
        h.cards.push(this.draw(this.heroIndex, this.active));
        if (h.splitAces && !(this.rules.resplitAces && cardPip(h.cards[1]) === 1)) h.done = true;
      }
      if (!h.done && (isBlackjack(h.cards) && !h.fromSplit)) h.done = true;
      if (!h.done && handValue(h.cards).total >= 21) h.done = true;
      if (!h.done) return;
      this.active++;
    }
  }

  // ---------- Dealer and settlement ----------

  private dealerTurn(): void {
    this.revealHole();
    const live = this.seats.some((s) => s.hands.some((h) => !h.surrendered && handValue(h.cards).total <= 21 && !(isBlackjack(h.cards) && !h.fromSplit)));
    if (live && !this.dealerHasBlackjack()) {
      this.dealer = playDealer(this.dealer, () => this.draw('dealer', 0), this.rules);
    }
    this.settle();
  }

  private settle(): void {
    const dealerBJ = this.dealerHasBlackjack();
    let net = 0;
    for (const seat of this.seats) {
      for (const h of seat.hands) {
        let s = settleHand(h.cards, this.dealer, h.bet, this.rules, { fromSplit: h.fromSplit, surrendered: h.surrendered });
        // With no hole card, a dealer blackjack takes surrendered bets in full too.
        if (h.surrendered && dealerBJ && !this.rules.dealerPeeks) s = { result: 'lose', net: -h.bet };
        h.settlement = s;
        h.done = true;
        if (seat.hero) net += s.net;
      }
      if (seat.hero && seat.insurance > 0) net += settleInsurance(seat.insurance, dealerBJ);
    }
    this.bankroll += net;
    this.results.push({ round: this.round, bet: this.hero.hands[0]?.bet ?? 0, net, trueCountAtBet: this.betTrueCount });
    this.losingStreak = net < 0 ? this.losingStreak + 1 : net > 0 ? 0 : this.losingStreak;
    if (this.losingStreak === 0) this.tiltShown = false; // the guard can speak again on the next streak
    this.events.push({ kind: 'settled' });
    this.phase = this.bankroll < this.unit ? 'broke' : 'roundOver';
  }

  /** Clears the table for the next round. Shuffles when the cut card has come out. Returns true on a shuffle. */
  nextRound(): boolean {
    if (this.phase !== 'roundOver') throw new Error('The round is not over');
    for (const s of this.seats) { s.hands = []; s.insurance = 0; }
    this.dealer = [];
    this.holeRevealed = false;
    this.phase = 'betting';
    if (this.shoe.needsShuffle) {
      this.shoe.shuffle();
      this.tracker.reset();
      this.events.push({ kind: 'shuffle' });
      return true;
    }
    return false;
  }

  /** You enter your running count; graded against the real one. */
  countCheck(entered: number): boolean {
    const right = entered === this.runningCount;
    this.decisions.push({
      kind: 'count', correct: right, chosen: signed(entered), best: signed(this.runningCount),
      situation: `Count check, round ${this.round}`, trueCount: this.trueCount, costPer100: null,
      note: right ? 'Running count right.' : `The running count was ${signed(this.runningCount)}.`,
    });
    return right;
  }

  // ---------- Tilt guard ----------

  /**
   * After a losing streak, several quick wrong decisions in a row suggest it's time for a break. Returns a plain,
   * non-judgemental message once per streak, or null.
   */
  tiltWarning(): string | null {
    if (this.tiltShown || this.losingStreak < TILT_LOSING_STREAK) return null;
    const recent = this.decisions.filter((d) => d.kind === 'play').slice(-4);
    const quickWrong = recent.filter((d) => !d.correct && d.ms !== undefined && d.ms < 2000).length;
    if (quickWrong < 2) return null;
    this.tiltShown = true;
    return `You've lost ${this.losingStreak} rounds in a row, and the last few decisions were quick and off. That happens to everyone. A short break usually helps more than the next hand.`;
  }

  /** Losing rounds in a row. */
  get losingRounds(): number {
    return this.losingStreak;
  }

  // ---------- Summary ----------

  summary() {
    const of = (k: DecisionRecord['kind']) => this.decisions.filter((d) => d.kind === k);
    const tally = (k: DecisionRecord['kind']) => ({ total: of(k).length, correct: of(k).filter((d) => d.correct).length });
    const bets = of('bet');
    const mistakes = this.decisions
      .filter((d) => !d.correct && d.kind !== 'count')
      .sort((a, b) => (b.costPer100 ?? 5) - (a.costPer100 ?? 5))
      .slice(0, 5);
    return {
      rounds: this.results.length,
      net: this.bankroll - this.startingBankroll,
      plays: tally('play'),
      insurance: tally('insurance'),
      bets: { ...tally('bet'), over: bets.filter((d) => Number(d.chosen) > Number(d.best)).length, under: bets.filter((d) => Number(d.chosen) < Number(d.best)).length },
      counts: tally('count'),
      mistakes,
    };
  }
}

