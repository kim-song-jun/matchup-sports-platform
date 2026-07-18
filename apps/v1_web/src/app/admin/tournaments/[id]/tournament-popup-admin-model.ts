import type {
  V1AdminTournamentPopup,
  V1CreateTournamentPopupPayload,
  V1TournamentPopupStatus,
  V1UpdateTournamentPopupPayload,
} from '@/types/api';

export type PopupForm = {
  readonly title: string;
  readonly body: string;
  readonly imageUrl: string;
  readonly status: V1TournamentPopupStatus;
  readonly displayStartAt: string;
  readonly displayEndAt: string;
};

export const emptyPopupForm: PopupForm = {
  title: '',
  body: '',
  imageUrl: '',
  status: 'draft',
  displayStartAt: '',
  displayEndAt: '',
};

export function formFromPopup(popup: V1AdminTournamentPopup): PopupForm {
  return {
    title: popup.title,
    body: popup.body,
    imageUrl: popup.imageUrl ?? '',
    status: popup.status,
    displayStartAt: toDatetimeLocalValue(popup.displayStartAt),
    displayEndAt: toDatetimeLocalValue(popup.displayEndAt),
  };
}

export function popupPayloadFromForm(
  form: PopupForm,
): V1CreateTournamentPopupPayload | V1UpdateTournamentPopupPayload {
  const imageUrl = form.imageUrl.trim();
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    status: form.status,
    ...(imageUrl.length > 0 ? { imageUrl } : {}),
    displayStartAt: fromDatetimeLocalValue(form.displayStartAt),
    displayEndAt: fromDatetimeLocalValue(form.displayEndAt),
  };
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:mm" in local time, no trailing Z/offset.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
