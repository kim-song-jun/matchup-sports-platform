/** Formats digit-only Korean phone numbers for display; non-digit input is preserved. */
export function formatPhone(value: string): string {
  if (!/^\d+$/.test(value)) return value;
  if (value.length <= 3) return value;
  if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}
