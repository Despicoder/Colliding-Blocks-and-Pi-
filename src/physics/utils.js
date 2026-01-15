export function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

export function formatMass(n) {
  // n is number
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
  return String(Math.floor(n));
}

export function formatRatio(r) {
  if (!Number.isFinite(r)) return "∞";
  if (r >= 1e6) return r.toExponential(2);
  if (r >= 1e3) return r.toFixed(0);
  return r.toFixed(2);
}
