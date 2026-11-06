export function normalizeProfileText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function normalizeBirthDateForInput(value: unknown): string {
  const raw = normalizeProfileText(value);
  if (!raw) return '';
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const ymd = raw.match(/^(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return raw;
}

export function formatRosterBirthDate(dateValue: string | null): string {
  const normalized = normalizeBirthDateForInput(dateValue);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '미입력';
  const [year, month, day] = normalized.split('-');
  return `${year}.${month}.${day}`;
}
