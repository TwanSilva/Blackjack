// Bundle entry for the parallel simulation runner (scripts/run-index-sim.mjs).
export { simulateIndices, newAccumulator, mergeInto, readIndex, binStats, TC_MIN, TC_MAX } from './indexSim';
export { DEFAULT_RULES } from '../rules';
export { DEVIATIONS, describeDeviation } from '../strategy/deviations';
export { computeIndex } from '../strategy/indexCompute';
