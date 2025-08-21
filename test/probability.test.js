import assert from 'node:assert/strict';
import { normalize, probAtLeastOnce, probAtLeastOnceWithout, binomPMF } from '../loot/probability.js';

// normalization with weights
{
  const probs = normalize([{ name: 'a', weight: 1 }, { name: 'b', weight: 3 }]);
  assert.deepEqual(probs, [
    { name: 'a', p: 0.25 },
    { name: 'b', p: 0.75 }
  ]);
}

// normalization with ranges
{
  const probs = normalize([{ name: 'a', range: [1, 50] }, { name: 'b', range: [51, 100] }]);
  assert.deepEqual(probs.map(e => e.p), [0.5, 0.5]);
}

// probability at least once with replacement
assert(Math.abs(probAtLeastOnce(0.5, 2) - 0.75) < 1e-9);

// probability at least once without replacement
assert(Math.abs(probAtLeastOnceWithout(0.5, 2, 2) - 1) < 1e-9);

// binomial distribution
{
  const pmf = binomPMF(0.5, 2).map(v => Number(v.toFixed(3)));
  assert.deepEqual(pmf, [0.25, 0.5, 0.25]);
}

console.log('All tests passed.');
