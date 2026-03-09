export function formatCurrency(value: number | undefined | null): string {
  const num = typeof value === 'number' && isFinite(value) ? value : 0;
  return num.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function safeNum(val: unknown): number {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isFinite(n) ? n : 0;
  }
  return 0;
}
