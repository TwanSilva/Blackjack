# Blackjack trainer

A personal blackjack trainer that runs in the browser. Spec: `UX Blackjack.md` (rules, strategy) and `UI Blackjack.md` (looks).

Built so far: build steps 1 to 3.

1. **Game engine** in `src/engine/`: cards, shoe with cut card, hand values, dealer play (H17/S17), available actions, payouts. No UI code.
2. **Strategy oracle** in `src/engine/strategy/`: `bestPlay(hand, upcard, rules, trueCount?)` returns the best action and the EV of every allowed option.
3. **Strategy drill and chart** in `src/ui/`: the drill, wrong-answer feedback, and the corner basic strategy chart. Every answer, chart cell and "why" sentence comes from the engine.

## How strategy is computed

Nothing is typed in from a chart. For each rule set the engine computes expected values:

- The shoe starts at the chosen number of decks. The player's two cards and the dealer upcard are removed.
- The hole card is drawn from that exact shoe and conditioned on "no dealer blackjack" (dealer peek). Without a peek (European no hole card), a dealer blackjack takes every bet on the table, doubles and splits included.
- After the hole card, the player's and dealer's draws use the remaining shoe, held fixed during the hand.
- Basic strategy is total-dependent. A cell's EV is the probability-weighted average over the two-card combinations that make it.
- Splits: each split hand draws from the same shoe. Resplits are taken when they are worth more, up to the max hand count. Split aces get one card each.

A Monte Carlo test (`tests/montecarlo.test.ts`) checks the EV recursion against simulated hands that use the step-1 game engine.

## Commands

```bash
npm install
npm run dev      # app at http://localhost:5173
npm test         # all tests (also writes out/charts.txt)
npm run chart    # computed charts for H17 and S17, plus the closest decisions
npm run build
```
