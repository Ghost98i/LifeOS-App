/** Mask currency-qualified amounts, preserving unrelated dates, IDs and counts. */
export function maskFinancialText(text: string, active: boolean): string {
  if (!active) return text;
  return text
    .replace(/((?:US\$|\$U?|\b(?:USD|UYU))\s*[+−-]?\s*)\d[\d.,]*/gi, '$1••••')
    .replace(/\b\d[\d.,]*\s*(USD|UYU)\b/gi, '•••• $1');
}
