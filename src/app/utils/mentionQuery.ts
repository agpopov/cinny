// Query text may include spaces and parentheses. Requiring a token boundary
// avoids email addresses, URLs, MXIDs and repeated literal @ signs.
export function mentionQueryStart(text: string): number | undefined {
  const at = text.lastIndexOf('@');
  if (at < 0 || text.length - at > 101 || /[\n\r@]/.test(text.slice(at + 1))) return undefined;
  if (at > 0 && !/[\s([{>,;!?"']/.test(text[at - 1])) return undefined;
  return at;
}
