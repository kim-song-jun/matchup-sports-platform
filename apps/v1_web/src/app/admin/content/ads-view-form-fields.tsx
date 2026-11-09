'use client';

import { useId, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { adChannelLabel } from '@/lib/admin-labels';
import type { V1AdChannel } from '@/types/ads';
import { AdImageField } from './ads-view-image-field';
import { AD_LINK_MAX_LENGTH, checkAdLink } from '@/lib/ad-link-rule';
import {
  AD_ALT_TEXT_MAX_LENGTH,
  AD_POPUP_DESCRIPTION_MAX_LENGTH,
  AD_POPUP_HEADLINE_MAX_LENGTH,
  type AdChannelFormState,
  type AdPopupFormState,
} from './ads-view-model';

const FIELD_INPUT_CLASS =
  'h-[44px] w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]';

const HINT_CLASS = 'text-[length:var(--font-size-caption)] leading-5 text-[var(--text-muted)]';

const ERROR_CLASS = 'text-[length:var(--font-size-caption)] font-medium leading-5 text-[var(--red700)]';

export function AdTextField({
  label,
  hint,
  value,
  onChange,
  disabled,
  maxLength,
  type = 'text',
  placeholder,
  required,
  min,
  error,
  onBlur,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  maxLength?: number;
  type?: 'text' | 'datetime-local';
  placeholder?: string;
  required?: boolean;
  min?: string;
  /** Why the value cannot be saved, shown under the input and tied to it for screen readers. */
  error?: string;
  onBlur?: () => void;
}) {
  const id = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        min={min}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        onBlur={onBlur}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={FIELD_INPUT_CLASS}
      />
      {hint ? <p id={hintId} className={HINT_CLASS}>{hint}</p> : null}
      {error ? <p id={errorId} role="alert" className={ERROR_CLASS}>{error}</p> : null}
    </div>
  );
}

/** Opens the link in a new tab so the owner can see where readers would land; it never counts as a click. */
function LinkPreview({ linkUrl }: { linkUrl: string }) {
  const href = linkUrl.trim();
  if (!href || !checkAdLink(href).ok) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-lg px-1 text-[length:var(--font-size-label)] font-semibold text-[var(--blue700)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      <ExternalLink size={14} aria-hidden="true" />
      새 탭에서 링크 열어 보기
    </a>
  );
}

type ChannelFieldsProps = {
  channel: V1AdChannel;
  /** A popup state carries headline and description as well; its presence adds those two inputs. */
  state: AdChannelFormState | AdPopupFormState;
  disabled: boolean;
  upload: (file: File) => Promise<string>;
  onPatch: (patch: Partial<AdPopupFormState>) => void;
  /** The owner already tried to save, so a link problem shows even if the field was never left. */
  showErrors: boolean;
  onImageBusyChange: (busy: boolean) => void;
};

/** One channel's inputs. */
export function AdChannelFields({ channel, state, disabled, upload, onPatch, showErrors, onImageBusyChange }: ChannelFieldsProps) {
  const name = adChannelLabel(channel);
  const popupState = 'headline' in state ? state : null;
  // A half-typed address is not an error yet: the reason appears once the owner leaves the field or tries to save.
  const [linkLeft, setLinkLeft] = useState(false);
  const trimmedLink = state.linkUrl.trim();
  const linkCheck = trimmedLink ? checkAdLink(trimmedLink) : null;
  const linkError = linkCheck && !linkCheck.ok && (linkLeft || showErrors) ? linkCheck.reason : undefined;

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--border)] p-3">
      <legend className="px-1 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">
        {name} <span className="font-normal text-[var(--text-muted)]">(비워 두면 이 채널은 쓰지 않아요)</span>
      </legend>

      {popupState ? (
        <>
          <AdTextField
            label="팝업 제목"
            hint="게시하려면 꼭 필요해요."
            value={popupState.headline}
            onChange={(headline) => onPatch({ headline })}
            maxLength={AD_POPUP_HEADLINE_MAX_LENGTH}
            disabled={disabled}
          />
          <AdTextField
            label="팝업 설명 (선택)"
            value={popupState.description}
            onChange={(description) => onPatch({ description })}
            maxLength={AD_POPUP_DESCRIPTION_MAX_LENGTH}
            disabled={disabled}
          />
        </>
      ) : null}

      <AdImageField
        channel={channel}
        imageUrl={state.imageUrl}
        altText={state.altText}
        disabled={disabled}
        upload={upload}
        onChange={(imageUrl) => onPatch({ imageUrl })}
        onBusyChange={onImageBusyChange}
      />
      <AdTextField
        label="대체 텍스트"
        hint="이미지를 볼 수 없는 분께 읽어 주는 설명이에요. 게시하려면 꼭 필요해요."
        value={state.altText}
        onChange={(altText) => onPatch({ altText })}
        maxLength={AD_ALT_TEXT_MAX_LENGTH}
        disabled={disabled}
      />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <AdTextField
          label="시작 (한국 시간)"
          type="datetime-local"
          value={state.startAt}
          onChange={(startAt) => onPatch({ startAt })}
          disabled={disabled}
        />
        <AdTextField
          label="끝 (한국 시간)"
          type="datetime-local"
          value={state.endAt}
          min={state.startAt || undefined}
          onChange={(endAt) => onPatch({ endAt })}
          disabled={disabled}
        />
      </div>
      <AdTextField
        label="이동 링크"
        hint="/로 시작하는 앱 안 경로나 공개된 https:// 주소만 쓸 수 있어요. /admin·/api·/uploads·/tournament-ops 경로, localhost·내부망 주소, 아이디:비밀번호가 든 주소는 막혀요."
        value={state.linkUrl}
        onChange={(linkUrl) => onPatch({ linkUrl })}
        onBlur={() => setLinkLeft(true)}
        error={linkError}
        maxLength={AD_LINK_MAX_LENGTH}
        placeholder="/tournaments/… 또는 https://…"
        disabled={disabled}
      />
      <LinkPreview linkUrl={state.linkUrl} />
    </fieldset>
  );
}
