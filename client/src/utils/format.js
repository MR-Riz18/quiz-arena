// Small formatting helpers used across the UI.

export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s;
}

export function formatSeconds(ms) {
  return `${Math.max(0, (ms / 1000)).toFixed(1)}s`;
}

export function formatTimeAgo(date) {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  if (Number.isNaN(diffMs)) return '';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function pct(numerator, denominator) {
  if (!denominator) return '—';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}
