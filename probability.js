export function normalize(entries) {
  if (!entries.length) return [];
  if ('range' in entries[0]) {
    const weights = entries.map(e => ({ name: e.name, weight: e.range[1] - e.range[0] + 1 }));
    const total = weights.reduce((a, b) => a + b.weight, 0);
    return weights.map(w => ({ name: w.name, p: w.weight / total }));
  } else {
    const total = entries.reduce((a, b) => a + (b.weight || 0), 0);
    return entries.map(e => ({ name: e.name, p: (e.weight || 0) / total }));
  }
}

export function probAtLeastOnce(p, n) {
  return 1 - Math.pow(1 - p, n);
}

export function probAtLeastOnceWithout(p, n, T) {
  let q = 1;
  for (let k = 0; k < n; k++) {
    const adj = p * (T / (T - k));
    q *= Math.max(0, 1 - Math.min(adj, 1));
  }
  return 1 - q;
}

export function binomPMF(p, n) {
  const pmf = new Array(n + 1).fill(0);
  let coeff = 1;
  for (let k = 0; k <= n; k++) {
    if (k > 0) coeff = (coeff * (n - (k - 1))) / k;
    pmf[k] = coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
  }
  return pmf;
}
