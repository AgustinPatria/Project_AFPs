const usdFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});
const usdFormatter1 = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

export function fmtUsdMM(n: number, digits: 0 | 1 = 0): string {
  return digits === 0 ? usdFormatter.format(n) : usdFormatter1.format(n);
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(n: number, digits = 2): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(digits)}%`;
}
