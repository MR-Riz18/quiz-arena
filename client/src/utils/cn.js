// Tiny classNames joiner (avoids a dependency for one-liners).
export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}
