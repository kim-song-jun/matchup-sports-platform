'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useV1CreateTournament, useV1MasterSports } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1TournamentFormat } from '@/types/api';
import {
  AdminPageHeader,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';

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
      <label htmlFor={id} className="text-[13px] font-semibold text-gray-700">
        {label}
        {required && (
          <>
            <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            <span className="sr-only">(필수)</span>
          </>
        )}
      </label>
      {children}
      {hint && <p className="text-[12px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ── Input class ───────────────────────────────────────────────────────────

const inputCls = [
  'h-[44px] px-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900',
  'placeholder:text-gray-400',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

const textareaCls = [
  'px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 resize-none',
  'placeholder:text-gray-400',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');

// ── Datetime text input helpers ───────────────────────────────────────────

/** Accepts "YYYY-MM-DD HH:MM" — returns true if it looks valid */
function isValidDatetimeText(value: string): boolean {
  if (!value.trim()) return true; // empty is valid (optional field)
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value.trim());
}

/** Converts "YYYY-MM-DD HH:MM" → ISO string, or returns null for empty/invalid */
function datetimeTextToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isValidDatetimeText(trimmed)) return null;
  // Replace space with "T" so Date can parse it
  const iso = new Date(trimmed.replace(' ', 'T')).toISOString();
  return iso;
}

// ── Styled datetime text input ────────────────────────────────────────────

function DatetimeTextInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
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
        placeholder="YYYY-MM-DD HH:MM"
        maxLength={16}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
        className={[
          inputCls,
          invalid
            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
            : '',
        ]
          .join(' ')
          .trim()}
      />
      {invalid && (
        <p id={`${id}-err`} role="alert" className="text-[12px] text-red-500 mt-0.5">
          날짜 형식이 맞지 않아요 (YYYY-MM-DD HH:MM)
        </p>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTournamentsNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const { data: sports, isPending: sportsPending } = useV1MasterSports();
  const createMutation = useV1CreateTournament();

  // ── Form state ──────────────────────────────────────────────────────
  const [sportId, setSportId] = useState('');
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<V1TournamentFormat>('knockout');
  const [scheduledAt, setScheduledAt] = useState('');
  const [registrationDeadlineAt, setRegistrationDeadlineAt] = useState('');
  const [venue, setVenue] = useState('');
  const [teamCount, setTeamCount] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [entryFee, setEntryFee] = useState('0');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [prizePool, setPrizePool] = useState('');
  const [prizeBreakdown, setPrizeBreakdown] = useState('');
  const [rulesText, setRulesText] = useState('');
  const [refundPolicyText, setRefundPolicyText] = useState('');

  const isPending = createMutation.isPending;

  // ── Validation ───────────────────────────────────────────────────────
  const canSubmit =
    !isPending &&
    sportId.trim().length > 0 &&
    title.trim().length > 0 &&
    isValidDatetimeText(scheduledAt) &&
    isValidDatetimeText(registrationDeadlineAt);

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    createMutation.mutate(
      {
        sportId: sportId.trim(),
        title: title.trim(),
        format,
        ...(datetimeTextToIso(scheduledAt) ? { scheduledAt: datetimeTextToIso(scheduledAt)! } : {}),
        ...(datetimeTextToIso(registrationDeadlineAt)
          ? { registrationDeadlineAt: datetimeTextToIso(registrationDeadlineAt)! }
          : {}),
        ...(venue.trim() ? { venue: venue.trim() } : {}),
        ...(teamCount ? { teamCount: parseInt(teamCount, 10) } : {}),
        ...(minPlayers ? { minPlayers: parseInt(minPlayers, 10) } : {}),
        ...(maxPlayers ? { maxPlayers: parseInt(maxPlayers, 10) } : {}),
        entryFee: parseInt(entryFee || '0', 10),
        ...(prizePool ? { prizePool: parseInt(prizePool, 10) } : {}),
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
          className="inline-flex items-center gap-1 text-[13px] text-gray-400 hover:text-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          대회 목록으로
        </Link>
      </div>

      <AdminPageHeader
        eyebrow="대회 관리"
        title="새 대회 만들기"
        description="대회 기본 정보를 입력하면 초안(draft) 상태로 생성돼요."
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

          {/* ── 기본 정보 ────────────────────────────────────────────── */}
          <section className="px-5 py-6 border-b border-gray-100">
            <h2 className="text-[15px] font-bold text-gray-900 mb-4">기본 정보</h2>
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
                hint="리그: 모든 팀이 순위전 / 토너먼트: 녹아웃 대진 / 조별리그+토너먼트: 혼합"
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

              <FormField id="scheduled-at" label="대회 일정" hint="예: 2026-08-15 09:00">
                <DatetimeTextInput
                  id="scheduled-at"
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  disabled={isPending}
                />
              </FormField>

              <FormField id="registration-deadline-at" label="신청 마감일" hint="예: 2026-08-01 23:59">
                <DatetimeTextInput
                  id="registration-deadline-at"
                  value={registrationDeadlineAt}
                  onChange={setRegistrationDeadlineAt}
                  disabled={isPending}
                />
              </FormField>

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
            </div>
          </section>

          {/* ── 팀 / 선수 설정 ───────────────────────────────────────── */}
          <section className="px-5 py-6 border-b border-gray-100">
            <h2 className="text-[15px] font-bold text-gray-900 mb-4">팀 · 선수 설정</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField id="team-count" label="참가 팀 수" hint="비우면 무제한">
                <input
                  id="team-count"
                  type="number"
                  min="2"
                  max="128"
                  value={teamCount}
                  onChange={(e) => setTeamCount(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 16"
                  className={inputCls}
                />
              </FormField>

              <FormField id="min-players" label="최소 선수 수">
                <input
                  id="min-players"
                  type="number"
                  min="1"
                  value={minPlayers}
                  onChange={(e) => setMinPlayers(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 5"
                  className={inputCls}
                />
              </FormField>

              <FormField id="max-players" label="최대 선수 수">
                <input
                  id="max-players"
                  type="number"
                  min="1"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 11"
                  className={inputCls}
                />
              </FormField>
            </div>
          </section>

          {/* ── 참가비 / 계좌 ────────────────────────────────────────── */}
          <section className="px-5 py-6 border-b border-gray-100">
            <h2 className="text-[15px] font-bold text-gray-900 mb-4">참가비 · 계좌</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField id="entry-fee" label="참가비 (원)" hint="0원이면 무료 대회로 표시돼요">
                <input
                  id="entry-fee"
                  type="number"
                  min="0"
                  step="1000"
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                  disabled={isPending}
                  placeholder="0"
                  className={inputCls}
                />
              </FormField>

              <FormField id="prize-pool" label="총 상금 (원)" hint="비우면 상금 없음으로 표시돼요">
                <input
                  id="prize-pool"
                  type="number"
                  min="0"
                  step="10000"
                  value={prizePool}
                  onChange={(e) => setPrizePool(e.target.value)}
                  disabled={isPending}
                  placeholder="예: 1000000"
                  className={inputCls}
                />
              </FormField>

              <div className="md:col-span-2">
                <FormField
                  id="prize-breakdown"
                  label="순위별 상금 안내"
                  hint="참가자에게 공개되는 상금 안내 문구예요"
                >
                  <input
                    id="prize-breakdown"
                    type="text"
                    value={prizeBreakdown}
                    onChange={(e) => setPrizeBreakdown(e.target.value)}
                    disabled={isPending}
                    placeholder="예: 1위 100만원 · 2위 50만원 · 3위 30만원"
                    maxLength={200}
                    className={inputCls}
                  />
                </FormField>
              </div>

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
          </section>

          {/* ── 규정 / 환불 ──────────────────────────────────────────── */}
          <section className="px-5 py-6">
            <h2 className="text-[15px] font-bold text-gray-900 mb-4">규정 · 환불 정책</h2>
            <div className="flex flex-col gap-4">
              <FormField id="rules-text" label="대회 규정">
                <textarea
                  id="rules-text"
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  disabled={isPending}
                  rows={5}
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
                  rows={4}
                  placeholder="환불 정책을 입력해 주세요."
                  className={textareaCls}
                />
              </FormField>
            </div>
          </section>
        </div>

        {/* ── Footer actions ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mt-5">
          <Link
            href="/admin/tournaments"
            className="inline-flex items-center justify-center h-[48px] px-6 rounded-xl text-[15px] font-semibold text-gray-600 bg-white border border-gray-200 hover:border-gray-300 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              'inline-flex items-center justify-center h-[48px] px-8 rounded-xl text-[15px] font-semibold transition-colors',
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
