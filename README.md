# Blackjack trainer

A personal blackjack trainer that runs in the browser. Spec: `UX Blackjack.md` (rules, strategy) and `UI Blackjack.md` (looks).

Built so far: build steps 1 to 5.

1. **Game engine** in `src/engine/`: cards, shoe with cut card, hand values, dealer play (H17/S17), available actions, payouts. No UI code.
2. **Strategy oracle** in `src/engine/strategy/`: `bestPlay(hand, upcard, rules, trueCount?)` returns the best action and the EV of every allowed option.
3. **Strategy drill and chart** in `src/ui/`: the drill, wrong-answer feedback, and the corner basic strategy chart. Every answer, chart cell and "why" sentence comes from the engine.
4. **Hi-Lo counting** in `src/engine/counting/`. The count system is a data table, so other systems can be added as data. It includes the running count, decks remaining, the true count (round down by default) and a count tracker. The drills:
   - **Count drill:** single cards, two-card hands, a full table, or the 52-card deck test. Learning mode has you tap +1/0/−1 for each card; test mode has you enter the count at the end. Four speeds, adjustable to 0.1 s. A review screen follows each drill.
   - **True count drill:** the decks remaining are given, the exact cards remaining are given, or you read them from a picture of the discard tray. Positions are dealt from a real shuffled shoe.

5. **Progress** in `src/engine/progress/`. The player model is plain JSON: per-cell accuracy and EV lost, a spaced-repetition box and due date for every chart cell, the mistake log, session history, count runs, true count results, streaks and decision times.
   - **Spaced repetition:** a miss sends a cell back to box 0. Each right answer moves it up a box and pushes its due date out (10 min, 1 h, 1 day, 3 days, 7 days). The drill deals missed and due cells more often, and a missed cell comes back once, three hands later, in the same session.
   - **Weak spots:** cells you have missed and not yet answered right several times in a row. "My weak spots" drills only those, and becomes the default filter after three sessions.
   - **Today's practice:** picks the roughly ten-minute drill most likely to help, from your own mistakes.
   - **Stats screen:** accuracy by hand type, a heat map of every chart cell, weak spots, count accuracy and speed charts, true count accuracy, the mistake log with replay, session history, and export/import of your progress as a JSON file.

The UI is split into `src/ui/app.ts` (the shell: chart overlay, keys, pausing) and one file per screen in `src/ui/screens/`. Opening the chart, or switching away from the tab, pauses any running drill.

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
