// First sentence of a summary, ending in exactly one period. Splits only where
// a new sentence starts with a capital letter or digit, so "U.S. employers" stays whole.
export function firstSentence(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/)[0] ?? "";
  return /[.!?]$/.test(first) ? first : `${first}.`;
}
