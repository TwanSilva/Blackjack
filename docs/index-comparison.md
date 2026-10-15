# Hi-Lo index numbers: memory table, EV engine and Monte Carlo

**Status:** since 2026-10-15 the trainer's table (`src/engine/strategy/deviations.ts`) uses the simulated H17 floor
indices below, tagged with this simulation as their source. The memory values are kept in it only as a reference
column (`memoryIndex`). The run's summary is in `docs/sim-indices-h17.json`.

Three sources, compared for every row of `src/engine/strategy/deviations.ts`:

- **Memory:** the table in `deviations.ts`. Typed from memory, **unverified**, usually quoted for S17 shoe games.
- **Engine:** `computeIndex` in `src/engine/strategy/indexCompute.ts`. An exact EV calculation on the average shoe at
  each true count, two-card hands only, with real floored counts from whole running counts at 4 decks left.
- **Simulation:** `src/engine/sim/indexSim.ts`, run with `npm run sim -- <shoes> <h17|s17>`. Real shuffled shoes,
  multi-card hands, both plays from the same remaining cards. **This is the reference.**

All indices use **floor** rounding (true count = running count ÷ decks left rounded to the half deck, then rounded
down). The index is the lowest displayed true count at which the deviation wins on average, with every higher count
also winning.

## Simulation setup and precision

| | H17 (your rules) | S17 (for comparison) |
|---|---|---|
| Rules | 8 decks, H17, 3:2, double any two, DAS, split to 4, no resplit aces, late surrender, dealer peeks, 75% penetration | same, S17 |
| Shoes | 20,000,160 | 5,000,040 |
| Run time | 441 s on 19 threads | 107 s |
| Smallest sample in a bin that decides an index | 712,676 hands (10 vs 10 at +4) | about a quarter of that |
| Standard error of the gain in deciding bins | 0.02 to 0.19 per 100 bet | 0.04 to 0.40 per 100 bet |

- **Method:** the standard errors come from the spread between 190 independent batches of shoes, so correlation
  between samples in the same shoe is counted. It turned out not to matter much: batch errors were 0.91 to 1.09 times
  the naive ones.
- **Confidence:** "clear" means the gain at the index and one below it are both at least 2 standard errors from zero.
  "Close" means one of them is within 2 standard errors. There the play is nearly break-even in that count band, so
  the index could be one off and either choice costs very little.

## Results for your rules (H17)

Gains are per 100 bet, ± 1 standard error. "Gain at −1" is the gain one count below the index (should be negative).

| Row | Switch to | Memory | Engine | **Simulation** | Confidence | Gain at index | Gain at −1 |
|---|---|---|---|---|---|---|---|
| Insurance vs A | take insurance | +3 | +3 | **+3** | clear | +1.30 ± 0.03 | −1.13 ± 0.02 |
| 16 vs 10 | stand | 0 | +1 | **0** | clear | +0.07 ± 0.02 | −0.58 ± 0.02 |
| 15 vs 10 | stand | +4 | +4 | **+4** | clear | +0.28 ± 0.08 | −0.53 ± 0.07 |
| 10,10 vs 5 | split | +5 | +5 | **+5** | clear | +2.03 ± 0.19 | −1.05 ± 0.12 |
| 10,10 vs 6 | split | +4 | +4 | **+4** | clear | +0.90 ± 0.12 | −1.77 ± 0.10 |
| 10 vs 10 | double | +4 | +4 | **+4** | close | +0.67 ± 0.17 | −0.15 ± 0.13 |
| 12 vs 3 | stand | +2 | +1 | **+1** | clear | +0.17 ± 0.04 | −1.18 ± 0.03 |
| 12 vs 2 | stand | +3 | +3 | **+3** | clear | +0.35 ± 0.07 | −0.78 ± 0.05 |
| 11 vs A | double | +1 | −1 | **−1** | clear | +0.13 ± 0.05 | −1.92 ± 0.07 |
| 9 vs 2 | double | +1 | 0 | **+1** | clear | +0.59 ± 0.05 | −0.74 ± 0.04 |
| 10 vs A | double | +4 | +3 | **+3** | clear | +1.71 ± 0.15 | −0.79 ± 0.09 |
| 9 vs 7 | double | +3 | +3 | **+4** | close | +1.99 ± 0.19 | −0.08 ± 0.13 |
| 16 vs 9 | stand | +5 | +5 | **+5** | close | +0.45 ± 0.11 | −0.00 ± 0.08 |
| 13 vs 2 | stand (hit below) | −1 | −1 | **−1** | clear | +1.10 ± 0.03 | −0.40 ± 0.04 |
| 12 vs 4 | stand (hit below) | 0 | −1 | **0** | clear | +1.13 ± 0.03 | −0.28 ± 0.04 |
| 12 vs 5 | stand (hit below) | −2 | −2 | **−2** | clear | +0.20 ± 0.04 | −1.42 ± 0.07 |
| 12 vs 6 | stand (hit below) | −1 | −4 | **−3** | close | +1.29 ± 0.07 | −0.01 ± 0.09 |
| 13 vs 3 | stand (hit below) | −2 | −3 | **−2** | close | +1.63 ± 0.04 | −0.06 ± 0.07 |
| 14 vs 10 | surrender | +3 | +3 | **+3** | clear | +0.52 ± 0.06 | −0.73 ± 0.04 |
| 15 vs 10 | surrender | 0 | 0 | **0** | clear | +0.97 ± 0.02 | −0.18 ± 0.02 |
| 15 vs 9 | surrender | +2 | +2 | **+2** | close | +0.02 ± 0.04 | −1.18 ± 0.03 |
| 15 vs A | surrender (hit below) | +1 | −1 | **−1** | clear | +0.48 ± 0.02 | −0.44 ± 0.03 |

### How the decision comes up in your game

With late surrender, basic strategy surrenders a two-card 16 vs 10, 15 vs 10 and 16 vs 9. So in your game those
stand/hit decisions mostly come up on three or more cards. Simulated with those two-card hands left out:

- 16 vs 10: still **0** (clear)
- 15 vs 10: still **+4** (close)
- 16 vs 9: **+4** (close)

## S17 for comparison

S17 simulation, 5 million shoes: **18 of 22 memory values match**. Each of the 4 that differ is a "close" case,
one away:

- 10,10 vs 6: +5
- 12 vs 2: +4
- 12 vs 5: −1
- 15 vs A surrender: +2

So the memory table looks right for the S17 game it is usually quoted for. It is not right for H17.

## Memory vs simulation for your rules (H17)

**16 of 22 match.** The 6 that differ:

| Row | Memory | Simulation | Why |
|---|---|---|---|
| 11 vs A | +1 | −1 (clear) | H17: with an Ace up the dealer often makes soft 17 and hits it, so doubling is basic strategy and only stops at low counts |
| 15 vs A surrender | +1 | −1 (clear) | H17: surrender is basic strategy against an Ace |
| 10 vs A | +4 | +3 (clear) | H17 against an Ace |
| 12 vs 3 | +2 | +1 (clear) | H17: a dealer 3 can make soft 17. S17 gives +2, matching the memory table |
| 12 vs 6 | −1 | −3 (close) | H17: a dealer 6 makes soft 17 often (6 + Ace) |
| 9 vs 7 | +3 | +4 (close) | Not an H17 effect (a 7 can't make soft 17); the gain at +3 is −0.08 ± 0.13, a coin flip |

## Engine vs simulation

**16 of 22 match. The engine is off by one on 6 rows:** 16 vs 10, 9 vs 2, 9 vs 7, 12 vs 4, 12 vs 6, 13 vs 3. Two
known causes:

1. **Two-card hands only.** 16 vs 10 is the clear case: 10-6 crosses at +1.30, but three- and four-card 16s cross
   lower, and the real mix gives 0.
2. **The average shoe.** 9 vs 2 is a two-card decision, yet the engine says 0 and the simulation says +1. Real shoes
   at a count vary around the average, and that matters at the margin.

The engine is good for a quick estimate, not for the final numbers. Use the simulation.
