'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Check } from 'lucide-react';
import { useV1CreateTournament, useV1MasterSports, useV1UploadImages } from '@/hooks/use-v1-api';
import { onlyDigits, formatWithComma } from '@/lib/number-format';
import { extractErrorMessage } from '@/lib/error-message';
import { publicAssetPath } from '@/lib/assets';
import type { V1TournamentFormat } from '@/types/api';
import {
  AdminPageHeader,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';

// ── 작성 단계 스태퍼 (스크롤스파이) ─────────────────────────────────────────

const FORM_SECTIONS = [
  { id: 'tsec-basic', label: '기본 정보' },
  { id: 'tsec-team', label: '팀·선수 설정' },
  { id: 'tsec-fee', label: '참가비·계좌' },
  { id: 'tsec-prize', label: '상금·시상' },
  { id: 'tsec-rules', label: '규정·환불 정책' },
] as const;

function SectionStepper({ sections }: { sections: ReadonlyArray<{ id: string; label: string }> }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const els = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const idx = sections.findIndex((section) => section.id === visible[0].target.id);
        if (idx >= 0) setActiveIndex(idx);
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      aria-label="작성 단계"
      className="max-w-3xl mx-auto sticky top-[52px] lg:top-0 z-20 mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3"
    >
      <ol className="flex items-start">
        {sections.map((section, index) => {
          const completed = index < activeIndex;
          const isActive = index === activeIndex;
          const stepLabel = completed
            ? `${section.label} (완료)`
            : isActive
              ? `${section.label} (현재 단계)`
              : section.label;
          return (
            <li key={section.id} className="relative flex flex-1 flex-col items-center">
              {index < sections.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 top-[13px] h-[2px] w-full ${completed ? 'bg-[var(--blue500)]' : 'bg-[var(--border)]'}`}
                />
              ) : null}
              <button
                type="button"
                onClick={() => jumpTo(section.id)}
                aria-current={isActive ? 'step' : undefined}
                aria-label={stepLabel}
                className="relative z-10 flex flex-col items-center gap-1.5 rounded focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[var(--font-size-caption)] font-bold ${
                    isActive
                      ? 'bg-[var(--blue500)] text-[var(--static-white)]'
                      : completed
                        ? 'bg-[var(--blue100)] text-[var(--blue500)]'
                        : 'bg-[var(--grey100)] text-[var(--text-caption)]'
                  }`}
                >
                  {completed ? (
                    <Check size={13} aria-hidden="true" strokeWidth={2.5} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`text-[var(--font-size-micro)] leading-tight break-keep ${
                    isActive ? 'font-semibold text-[var(--text-strong)]' : 'text-[var(--text-caption)]'
                  }`}
                >
                  {section.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Form field component (shared within this file) ─────────────────────────

function FormField({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[var(--font-size-label)] font-semibold text-[var(--text-body)]">
        {label}
        {required && (
          <>
            <span className="text-[var(--red500)] ml-0.5" aria-hidden="true">*</span>
            <span className="sr-only">(필수)</span>
          </>
        )}
      </label>
      {children}
      {hint && <p className="text-[var(--font-size-caption)] text-[var(--text-caption)]">{hint}</p>}
    </div>
  );
}

// ── Input class ───────────────────────────────────────────────────────────

const inputCls = [
  'h-[44px] px-3 text-[var(--font-size-label)] bg-white border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
  'placeholder:text-[var(--text-caption)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

const textareaCls = [
  'px-3 py-2.5 text-[var(--font-size-label)] bg-white border border-[var(--border)] rounded-xl text-[var(--text-strong)] resize-none',
  'placeholder:text-[var(--text-caption)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

// ── Datetime text input helpers ───────────────────────────────────────────

/**
 * Parses "YYYY-MM-DD HH:MM" → Date, or null for empty/malformed/impossible
 * values (e.g. "2026-99-99 99:99" matches the shape regex but is not a real
 * calendar date — Date(...) yields Invalid Date, which we reject here rather
 * than let it reach .toISOString() later and throw RangeError).
 */
function parseDatetimeText(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) return null;
  const date = new Date(trimmed.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Accepts "YYYY-MM-DD HH:MM" — returns true if it looks valid (empty counts as valid/optional) */
function isValidDatetimeText(value: string): boolean {
  if (!value.trim()) return true; // empty is valid (optional field)
  return parseDatetimeText(value) !== null;
}

/** Converts "YYYY-MM-DD HH:MM" → ISO string, or returns null for empty/invalid */
function datetimeTextToIso(value: string): string | null {
  const date = parseDatetimeText(value);
  return date ? date.toISOString() : null;
}

/**
 * 대회 시작일("YYYY-MM-DD HH:MM")로부터 명단 제출 마감일 기본값(시작 7일 전 23:59)을 계산한다.
 * scheduledAt 이 비어있거나 형식이 유효하지 않으면 null을 반환 — 자동 채움을 하지 않는다.
 */
function suggestRosterDeadline(scheduledAt: string): string | null {
  const trimmed = scheduledAt.trim();
  if (!trimmed || !isValidDatetimeText(trimmed)) return null;
  const start = new Date(trimmed.replace(' ', 'T'));
  if (Number.isNaN(start.getTime())) return null;
  const suggested = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const yyyy = suggested.getFullYear();
  const mm = String(suggested.getMonth() + 1).padStart(2, '0');
  const dd = String(suggested.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} 23:59`;
}

// ── Styled datetime text input ────────────────────────────────────────────

function DatetimeTextInput({
  id,
  value,
  onChange,
  disabled,
  placeholder = '예: 2026-08-15 09:00',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const invalid = value.trim().length > 0 && !isValidDatetimeText(value);
  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={16}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
        className={[
          inputCls,
          invalid
            ? 'border-[var(--red500)] focus:border-[var(--red500)] focus:ring-[color:var(--red500)]/20'
            : '',
        ]
          .join(' ')
          .trim()}
      />
      {invalid && (
        <p id={`${id}-err`} role="alert" className="text-[var(--font-size-caption)] text-[var(--red500)] mt-0.5">
          날짜 형식이 맞지 않아요 (예: 2026-08-15 09:00)
        </p>
      )}
    </>
  );
}

// ── Cover image upload field ──────────────────────────────────────────────

function CoverImageUploadField({
  coverImageUrl,
  uploading,
  onSelectFile,
  onClear,
}: {
  coverImageUrl: string | null;
  uploading: boolean;
  onSelectFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {coverImageUrl ? (
        <img
          src={publicAssetPath(coverImageUrl)}
          alt=""
          className="w-20 h-20 rounded-xl object-cover border border-[var(--border)] flex-shrink-0"
        />
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="cover-image-input" className="sr-only">
          커버 이미지 파일 선택
        </label>
        <input
          id="cover-image-input"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelectFile(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center justify-center h-[38px] px-4 rounded-lg text-[var(--font-size-caption)] font-semibold text-[var(--text-muted)] bg-white border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          {uploading ? '업로드 중…' : coverImageUrl ? '이미지 변경' : '이미지 선택'}
        </button>
        {coverImageUrl ? (
          <button
            type="button"
            onClick={onClear}
            disabled={uploading}
            className="inline-flex items-center justify-center h-[38px] px-4 rounded-lg text-[var(--font-size-caption)] font-semibold text-[var(--text-caption)] hover:text-[var(--red500)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            제거
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTournamentsNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const { data: sports, isPending: sportsPending } = useV1MasterSports();
  const createMutation = useV1CreateTournament();
  const uploadImages = useV1UploadImages();

  // ── Form state ──────────────────────────────────────────────────────
  const [sportId, setSportId] = useState('');
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<V1TournamentFormat>('knockout');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledEndAt, setScheduledEndAt] = useState('');
  const [registrationDeadlineAt, setRegistrationDeadlineAt] = useState('');
  const [rosterDeadlineAt, setRosterDeadlineAt] = useState('');
  // 사용자가 명단 제출 마감일을 직접 수정하면 true로 전환 — 이후 대회 시작일 변경에 따른 자동 제안을 멈춘다
  const [rosterDeadlineTouched, setRosterDeadlineTouched] = useState(false);
  const [venue, setVenue] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [entryFee, setEntryFee] = useState('0');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [prizePool, setPrizePool] = useState('');
  const [prizeSummary, setPrizeSummary] = useState('');
  const [prizeBreakdown, setPrizeBreakdown] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [refundPolicyText, setRefundPolicyText] = useState('');

  const isPending = createMutation.isPending;

  // 커버 이미지는 선택 즉시 업로드하고 반환된 URL만 폼 상태에 보관한다 —
  // 팀 생성 폼(teams-form-client.tsx)과 동일한 "생성 전 업로드" 패턴.
  const handleCoverFileSelect = async (file: File) => {
    try {
      const result = await uploadImages.mutateAsync([file]);
      const url = result.urls[0];
      if (!url) throw new Error('이미지를 올리지 못했어요. 다시 시도해 주세요.');
      setCoverImageUrl(url);
    } catch (err) {
      showToast(extractErrorMessage(err, '이미지 업로드에 실패했어요.'), 'error');
    }
  };

  // 대회 시작일이 바뀌면 명단 제출 마감일을 자동으로 제안한다(시작 7일 전 23:59) —
  // 사용자가 이미 직접 수정했다면(rosterDeadlineTouched) 값을 덮어쓰지 않는다.
  useEffect(() => {
    if (rosterDeadlineTouched) return;
    const suggested = suggestRosterDeadline(scheduledAt);
    if (!suggested) return;
    setRosterDeadlineAt(suggested);
  }, [scheduledAt, rosterDeadlineTouched]);

  // ── Inline validation errors ────────────────────────────────────────
  const teamCountNum = teamCount ? parseInt(teamCount, 10) : null;
  const teamCountError =
    teamCount.trim().length === 0
      ? '참가 팀 수를 입력해 주세요.'
      : teamCountNum === null || teamCountNum < 2 || teamCountNum > 64
        ? '참가 팀 수는 2~64개여야 해요.'
      : null;

  const minPlayersNum = minPlayers ? parseInt(minPlayers, 10) : null;
  const maxPlayersNum = maxPlayers ? parseInt(maxPlayers, 10) : null;
  const playersRangeError: string | null = (() => {
    if (minPlayersNum !== null && (minPlayersNum < 1 || minPlayersNum > 50)) {
      return '선수 수는 1~50명이어야 해요.';
    }
    if (maxPlayersNum !== null && (maxPlayersNum < 1 || maxPlayersNum > 50)) {
      return '선수 수는 1~50명이어야 해요.';
    }
    if (minPlayersNum !== null && maxPlayersNum !== null && minPlayersNum > maxPlayersNum) {
      return '최소 선수 수는 최대 선수 수보다 클 수 없어요.';
    }
    return null;
  })();

  const scheduleRangeError: string | null = (() => {
    const startIso = datetimeTextToIso(scheduledAt);
    const endIso = datetimeTextToIso(scheduledEndAt);
    if (scheduledEndAt.trim() && !startIso) return '종료 일시는 시작 일시와 함께 입력해 주세요.';
    if (startIso && endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
      return '종료 일시는 시작 일시 이후여야 해요.';
    }
    return null;
  })();

  const rosterDeadlineError: string | null =
    rosterDeadlineAt.trim().length === 0 ? '명단 제출 마감일을 입력해 주세요.' : null;

  // ── Validation ───────────────────────────────────────────────────────
  const canSubmit =
    !isPending &&
    sportId.trim().length > 0 &&
    title.trim().length > 0 &&
    isValidDatetimeText(scheduledAt) &&
    isValidDatetimeText(scheduledEndAt) &&
    isValidDatetimeText(registrationDeadlineAt) &&
    isValidDatetimeText(rosterDeadlineAt) &&
    rosterDeadlineError === null &&
    teamCountError === null &&
    playersRangeError === null &&
    scheduleRangeError === null;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const scheduledAtIso = datetimeTextToIso(scheduledAt);
    const scheduledEndAtIso = datetimeTextToIso(scheduledEndAt);
    const registrationDeadlineAtIso = datetimeTextToIso(registrationDeadlineAt);
    const rosterDeadlineAtIso = datetimeTextToIso(rosterDeadlineAt);

    createMutation.mutate(
      {
        sportId: sportId.trim(),
        title: title.trim(),
        format,
        ...(scheduledAtIso ? { scheduledAt: scheduledAtIso } : {}),
        ...(scheduledEndAtIso ? { scheduledEndAt: scheduledEndAtIso } : {}),
        ...(registrationDeadlineAtIso ? { registrationDeadlineAt: registrationDeadlineAtIso } : {}),
        ...(rosterDeadlineAtIso ? { rosterDeadlineAt: rosterDeadlineAtIso } : {}),
        ...(venue.trim() ? { venue: venue.trim() } : {}),
        ...(coverImageUrl ? { coverImageUrl } : {}),
        teamCount: parseInt(teamCount, 10),
        ...(minPlayers ? { minPlayers: parseInt(minPlayers, 10) } : {}),
        ...(maxPlayers ? { maxPlayers: parseInt(maxPlayers, 10) } : {}),
        entryFee: parseInt(entryFee || '0', 10),
        ...(prizePool.trim() && !Number.isNaN(parseInt(prizePool, 10))
          ? { prizePool: parseInt(prizePool, 10) }
          : {}),
        ...(prizeSummary.trim() ? { prizeSummary: prizeSummary.trim() } : {}),
        ...(prizeBreakdown.trim() ? { prizeBreakdown: prizeBreakdown.trim() } : {}),
        ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
        ...(bankAccount.trim() ? { bankAccount: bankAccount.trim() } : {}),
        ...(bankHolder.trim() ? { bankHolder: bankHolder.trim() } : {}),
        ...(rulesText.trim() ? { rulesText: rulesText.trim() } : {}),
        ...(refundPolicyText.trim() ? { refundPolicyText: refundPolicyText.trim() } : {}),
      },
      {
        onSuccess: (data) => {
          showToast('대회를 만들었어요.', 'success');
          router.push(`/admin/tournaments/${data.id}`);
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '대회를 만들지 못했어요.'), 'error');
        },
      },
    );
  };

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/tournaments"
          className="inline-flex items-center gap-1 min-h-[44px] text-[var(--font-size-label)] text-[var(--text-caption)] hover:text-[var(--text-muted)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          대회 목록으로
        </Link>
      </div>

      <AdminPageHeader
        eyebrow="대회 관리"
        title="새 대회 만들기"
        description="대회 기본 정보를 입력하면 초안 상태로 생성돼요."
      />

      <form onSubmit={handleSubmit} noValidate>
        <SectionStepper sections={FORM_SECTIONS} />
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-[var(--border)] overflow-hidden">

          {/* ── 기본 정보 ────────────────────────────────────────────── */}
          <section id="tsec-basic" className="px-5 py-6 border-b border-[var(--border)] scroll-mt-[108px] lg:scroll-mt-24">
            <h2 className="text-[var(--font-size-body)] font-bold text-[var(--text-strong)] mb-4">기본 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <FormField id="sport-id" label="종목" required>
                <select
                  id="sport-id"
                  value={sportId}
                  onChange={(e) => setSportId(e.target.value)}
                  disabled={isPending || sportsPending}
                  required
                  aria-required="true"
                  className={inputCls}
                >
                  <option value="">종목 선택</option>
                  {(sports ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField id="title" label="대회명" required>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isPending}
                  required
                  aria-required="true"
                  placeholder="예: 2026 서울 풋살 오픈"
                  maxLength={100}
                  className={inputCls}
                />
              </FormField>

              <FormField
                id="format"
                label="대회 형식"
                required
                hint="리그: 모든 팀이 순위를 겨루는 방식 / 토너먼트: 탈락 대진 방식 / 조별리그+토너먼트: 혼합 방식"
              >
                <select
                  id="format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as V1TournamentFormat)}
                  disabled={isPending}
                  required
                  aria-required="true"
                  className={inputCls}
                >
                  <option value="league">리그 (순위전)</option>
                  <option value="knockout">토너먼트 (녹아웃)</option>
                  <option value="group_knockout">조별리그 + 토너먼트</option>
                </select>
              </FormField>

              <FormField id="scheduled-at" label="대회 시작" hint="예: 2026-08-15 09:00">
                <DatetimeTextInput
                  id="scheduled-at"
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  disabled={isPending}
                  placeholder="예: 2026-08-15 09:00"
                />
              </FormField>

              <FormField id="scheduled-end-at" label="대회 종료" hint="2일 이상 진행할 때 입력해 주세요. 예: 2026-08-16 18:00">
                <DatetimeTextInput
                  id="scheduled-end-at"
                  value={scheduledEndAt}
                  onChange={setScheduledEndAt}
                  disabled={isPending}
                  placeholder="예: 2026-08-16 18:00"
                />
                {scheduleRangeError ? (
                  <p className="mt-1 text-[var(--font-size-caption)] text-red-600" role="alert">
                    {scheduleRangeError}
                  </p>
                ) : null}
              </FormField>

              <div className="md:col-span-2">
                <FormField id="registration-deadline-at" label="신청 마감일" hint="예: 2026-08-01 23:59">
                  <DatetimeTextInput
                    id="registration-deadline-at"
                    value={registrationDeadlineAt}
                    onChange={setRegistrationDeadlineAt}
                    disabled={isPending}
                    placeholder="예: 2026-08-01 23:59"
                  />
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField
                  id="roster-deadline-at"
                  label="명단 제출 마감일"
                  required
                  hint="기본값은 대회 시작 7일 전 23:59예요. 필요하면 직접 수정해 주세요. 예: 2026-08-08 23:59"
                >
                  <DatetimeTextInput
                    id="roster-deadline-at"
                    value={rosterDeadlineAt}
                    onChange={(v) => {
                      setRosterDeadlineAt(v);
                      setRosterDeadlineTouched(true);
                    }}
                    disabled={isPending}
                    placeholder="예: 2026-08-08 23:59"
                  />
                  {rosterDeadlineError ? (
                    <p role="alert" className="mt-1 text-[var(--font-size-caption)] text-red-600">
                      {rosterDeadlineError}
                    </p>
                  ) : null}
                </FormField>
              </div>

              <div className="md:col-span-2">
                <FormField id="venue" label="장소">
                  <input
                    id="venue"
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    disabled={isPending}
                    placeholder="예: 서울월드컵경기장 보조구장"
                    maxLength={200}
                    className={inputCls}
                  />
                </FormField>
              </div>

              <div className="md:col-span-2 flex flex-col gap-1.5">
                <span className="text-[var(--font-size-label)] font-semibold text-[var(--text-body)]">
                  커버 이미지 <span className="font-medium text-[var(--text-caption)]">(선택)</span>
                </span>
                <CoverImageUploadField
                  coverImageUrl={coverImageUrl}
                  uploading={uploadImages.isPending}
                  onSelectFile={(file) => void handleCoverFileSelect(file)}
                  onClear={() => setCoverImageUrl(null)}
                />
                <p className="text-[var(--font-size-caption)] text-[var(--text-caption)]">
                  대회 목록·상세 상단에 표시돼요. JPG, PNG, WebP, GIF
                </p>
              </div>
            </div>
          </section>

          {/* ── 팀 / 선수 설정 ───────────────────────────────────────── */}
          <section id="tsec-team" className="px-5 py-6 border-b border-[var(--border)] scroll-mt-[108px] lg:scroll-mt-24">
            <h2 className="text-[var(--font-size-body)] font-bold text-[var(--text-strong)] mb-4">팀 · 선수 설정</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField id="team-count" label="참가 팀 수" required hint="대회별 모집 정원을 입력해 주세요">
                <input
                  id="team-count"
                  type="number"
                  min="2"
                  max="64"
                  value={teamCount}
                  onChange={(e) => setTeamCount(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 16"
                  required
                  aria-required="true"
                  aria-invalid={teamCountError !== null}
                  aria-describedby={teamCountError !== null ? 'team-count-err' : undefined}
                  className={[
                    inputCls,
                    teamCountError !== null
                      ? 'border-[var(--red500)] focus:border-[var(--red500)] focus:ring-[color:var(--red500)]/20'
                      : '',
                  ]
                    .join(' ')
                    .trim()}
                />
                {teamCountError !== null && (
                  <p id="team-count-err" role="alert" className="text-[var(--font-size-caption)] text-[var(--red500)] mt-0.5">
                    {teamCountError}
                  </p>
                )}
              </FormField>

              <FormField id="min-players" label="최소 선수 수">
                <input
                  id="min-players"
                  type="number"
                  min="1"
                  max="50"
                  value={minPlayers}
                  onChange={(e) => setMinPlayers(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 5"
                  aria-invalid={playersRangeError !== null}
                  aria-describedby={playersRangeError !== null ? 'players-range-err' : undefined}
                  className={[
                    inputCls,
                    playersRangeError !== null
                      ? 'border-[var(--red500)] focus:border-[var(--red500)] focus:ring-[color:var(--red500)]/20'
                      : '',
                  ]
                    .join(' ')
                    .trim()}
                />
              </FormField>

              <FormField id="max-players" label="최대 선수 수">
                <input
                  id="max-players"
                  type="number"
                  min="1"
                  max="50"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 11"
                  aria-invalid={playersRangeError !== null}
                  aria-describedby={playersRangeError !== null ? 'players-range-err' : undefined}
                  className={[
                    inputCls,
                    playersRangeError !== null
                      ? 'border-[var(--red500)] focus:border-[var(--red500)] focus:ring-[color:var(--red500)]/20'
                      : '',
                  ]
                    .join(' ')
                    .trim()}
                />
                {playersRangeError !== null && (
                  <p id="players-range-err" role="alert" className="text-[var(--font-size-caption)] text-[var(--red500)] mt-0.5">
                    {playersRangeError}
                  </p>
                )}
              </FormField>
            </div>
          </section>

          {/* ── 참가비 / 계좌 ────────────────────────────────────────── */}
          <section id="tsec-fee" className="px-5 py-6 border-b border-[var(--border)] scroll-mt-[108px] lg:scroll-mt-24">
            <h2 className="text-[var(--font-size-body)] font-bold text-[var(--text-strong)] mb-4">참가비 · 계좌</h2>
            <div className="flex flex-col gap-4">
              {/* 참가비 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField id="entry-fee" label="참가비 (원)" hint="0원이면 무료 대회로 표시돼요">
                  <input
                    id="entry-fee"
                    type="text"
                    value={formatWithComma(entryFee)}
                    onChange={(e) => setEntryFee(onlyDigits(e.target.value))}
                    disabled={isPending}
                    placeholder="0"
                    className={inputCls}
                  />
                </FormField>
              </div>

              {/* 은행/계좌/예금주 — 3열 한 행 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField id="bank-name" label="은행명">
                  <input
                    id="bank-name"
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    disabled={isPending}
                    placeholder="예: 국민은행"
                    maxLength={20}
                    className={inputCls}
                  />
                </FormField>

                <FormField id="bank-account" label="계좌번호">
                  <input
                    id="bank-account"
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    disabled={isPending}
                    placeholder="예: 123-456-789012"
                    maxLength={30}
                    className={inputCls}
                  />
                </FormField>

                <FormField id="bank-holder" label="예금주">
                  <input
                    id="bank-holder"
                    type="text"
                    value={bankHolder}
                    onChange={(e) => setBankHolder(e.target.value)}
                    disabled={isPending}
                    placeholder="예: 티밋 주식회사"
                    maxLength={30}
                    className={inputCls}
                  />
                </FormField>
              </div>
            </div>
          </section>

          {/* ── 상금 / 시상 ──────────────────────────────────────────── */}
          <section id="tsec-prize" className="px-5 py-6 border-b border-[var(--border)] scroll-mt-[108px] lg:scroll-mt-24">
            <h2 className="text-[var(--font-size-body)] font-bold text-[var(--text-strong)] mb-1">
              상금 · 시상 <span className="font-medium text-[var(--text-caption)]">(선택)</span>
            </h2>
            <p className="text-[var(--font-size-caption)] text-[var(--text-caption)] mb-4">
              현금 상금 없이 트로피·상품권 같은 물품만으로도 구성할 수 있어요.
            </p>
            <div className="flex flex-col gap-4">
              {/* 총상금 — 숫자 */}
              <FormField
                id="prize-pool"
                label="총상금 (원)"
                hint="현금 상금 합계예요. 물품만 있다면 비워 두세요 — 시상·리뷰 페이지의 '총 상금' 카드에 표시돼요"
              >
                <input
                  id="prize-pool"
                  type="text"
                  inputMode="numeric"
                  value={formatWithComma(prizePool)}
                  onChange={(e) => setPrizePool(onlyDigits(e.target.value))}
                  disabled={isPending}
                  placeholder="예: 1000000"
                  className={inputCls}
                />
              </FormField>

              {/* 상품 및 상금 안내 — 전체 너비 */}
              <FormField
                id="prize-summary"
                label="상품 및 상금"
                hint="상단 상품 및 상금 칸에 그대로 표시돼요"
              >
                <textarea
                  id="prize-summary"
                  value={prizeSummary}
                  onChange={(e) => setPrizeSummary(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 우승팀 현금 100만원 + 트로피"
                  maxLength={200}
                  rows={2}
                  className={textareaCls}
                />
              </FormField>

              <FormField
                id="prize-breakdown"
                label="상금 배분"
                hint="슬래시(/) 또는 줄바꿈으로 구분한 항목이 하단 박스로 표시돼요. 금액이 아닌 물품도 그대로 적을 수 있어요"
              >
                <textarea
                  id="prize-breakdown"
                  value={prizeBreakdown}
                  onChange={(e) => setPrizeBreakdown(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 1위 1,000,000원 / 2위 500,000원 / MVP 축구화"
                  maxLength={200}
                  rows={3}
                  className={textareaCls}
                />
              </FormField>
            </div>
          </section>

          {/* ── 규정 / 환불 ──────────────────────────────────────────── */}
          <section id="tsec-rules" className="px-5 py-6 scroll-mt-[108px] lg:scroll-mt-24">
            <h2 className="text-[var(--font-size-body)] font-bold text-[var(--text-strong)] mb-4">규정 · 환불 정책</h2>
            <div className="flex flex-col gap-4">
              <FormField id="rules-text" label="대회 규정">
                <textarea
                  id="rules-text"
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  disabled={isPending}
                  maxLength={10000}
                  rows={4}
                  placeholder="대회 참가 규정을 입력해 주세요."
                  className={textareaCls}
                />
              </FormField>

              <FormField id="refund-policy-text" label="환불 정책">
                <textarea
                  id="refund-policy-text"
                  value={refundPolicyText}
                  onChange={(e) => setRefundPolicyText(e.target.value)}
                  disabled={isPending}
                  rows={3}
                  placeholder="환불 정책을 입력해 주세요."
                  className={textareaCls}
                />
              </FormField>
            </div>
          </section>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto flex items-center gap-3 mt-5">
          <Link
            href="/admin/tournaments"
            className="inline-flex items-center justify-center h-[44px] px-6 rounded-xl text-[var(--font-size-label)] font-semibold text-[var(--text-muted)] bg-white border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              'inline-flex items-center justify-center h-[44px] px-8 rounded-xl text-[var(--font-size-label)] font-semibold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
              'bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
            aria-disabled={!canSubmit}
          >
            {isPending ? '만드는 중…' : '대회 만들기'}
          </button>
        </div>
      </form>

      <AdminToasts toasts={toasts} />
    </>
  );
}
