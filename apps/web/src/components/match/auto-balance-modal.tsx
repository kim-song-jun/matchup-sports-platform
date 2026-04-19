'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Info, RefreshCw, Sparkles, Users } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ErrorState } from '@/components/ui/error-state';
import { extractErrorMessage } from '@/lib/utils';
import { sportCardAccent } from '@/lib/constants';
import { usePreviewTeams, useComposeTeams } from '@/hooks/use-api';
import { ConfirmReplaceModal } from './confirm-replace-modal';
import type {
  ComposeTeamsInput,
  MatchTeamMember,
  TeamAssignment,
  PreviewTeamsResponse,
} from '@/types/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoBalanceModalProps {
  matchId: string;
  open: boolean;
  onClose: () => void;
  /** Called after compose succeeds — caller should invalidate match cache */
  onConfirmed?: () => void;
  defaultTeamCount?: number;
  sportType?: string;
  /** Number of confirmed participants — disables preview when < 2 */
  participantCount?: number;
  /**
   * Existing team assignments on the match. When non-empty, tapping "확정"
   * shows ConfirmReplaceModal before the compose mutation fires.
   * Caller must pass this prop for the replace-warning to trigger.
   */
  existingTeams?: { teamName: string; memberCount: number }[];
}

type Step = 'config' | 'preview' | 'confirming';

/** A single preview result stored in session-scoped FIFO history (max 2). */
type PreviewResult = PreviewTeamsResponse;

// ── Balance badge thresholds ───────────────────────────────────────────────────

function getBalanceBadge(maxEloGap: number): {
  label: string;
  className: string;
} {
  if (maxEloGap <= 50) {
    return {
      label: '균형 양호',
      className:
        'bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-800',
    };
  }
  if (maxEloGap <= 150) {
    return {
      label: '균형 보통',
      className:
        'bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800',
    };
  }
  return {
    label: '균형 주의',
    className:
      'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800',
  };
}

// ── Team color fallbacks (used when sportType not provided) ───────────────────
// All variants stay within the blue-indigo-sky-slate family to satisfy the
// single-accent brand rule. Red/green/purple are prohibited.
// WCAG AA contrast verified against #FFFFFF:
//   blue-600 (#2563EB) 4.72:1 | indigo-600 (#4F46E5) 5.25:1
//   sky-700 (#0369A1) 6.28:1  | slate-700 (#334155) 9.67:1
export const TEAM_COLORS: Record<number, { header: string; text: string }> = {
  0: {
    header: 'bg-blue-600',
    text: 'text-blue-700 dark:text-blue-300',
  },
  1: {
    header: 'bg-indigo-600',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  2: {
    header: 'bg-sky-700',
    text: 'text-sky-700 dark:text-sky-300',
  },
  3: {
    header: 'bg-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
  },
};

/**
 * Lightweight member row for team preview cards.
 * Intentionally NOT using UserCard from Task 69 because:
 * - UserCard's 44px avatar + manner score + profile/chat CTA slots are designed
 *   for applicant rows (task 69 use case), not dense team preview (5-6 rows per card).
 * - Team preview context only needs avatar + nickname + ELO indicator (visual density matters).
 * Design audit ack: replacing with UserCard here would create 44px rows inside a 4-team
 * side-by-side layout that doesn't fit in a 640px viewport.
 */
function MemberRow({ member }: { member: MatchTeamMember }) {
  const initials = member.nickname.slice(0, 1).toUpperCase();

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {/* Avatar 32x32 */}
      <div className="shrink-0 h-8 w-8">
        {member.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.profileImageUrl}
            alt={`${member.nickname} 프로필`}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 select-none">
            {initials}
          </div>
        )}
      </div>

      {/* Nickname */}
      <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 truncate">
        {member.nickname}
      </span>

      {/* Chips */}
      <div className="shrink-0 flex items-center gap-1">
        {!member.hasProfile && (
          <span className="rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 px-1.5 py-0.5 text-2xs font-medium">
            새내기
          </span>
        )}
        <span className="rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 text-2xs font-medium tabular-nums">
          {member.eloRating}
        </span>
      </div>
    </div>
  );
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({
  team,
  sportType,
}: {
  team: TeamAssignment;
  sportType?: string;
}) {
  // Prefer sport-accent tinting; fallback to team.color or indexed fallback
  const accentTint = sportType ? sportCardAccent[sportType]?.tint : null;
  const headerBg = TEAM_COLORS[team.index]?.header ?? 'bg-gray-500';
  const teamColor = TEAM_COLORS[team.index]?.text ?? 'text-gray-600 dark:text-gray-400';

  return (
    <div
      className={`rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden ${accentTint ?? 'bg-white dark:bg-gray-800'}`}
    >
      {/* Card header */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${headerBg}`}>
        <span className="text-sm font-bold text-white">{team.name}</span>
        <span className="text-xs font-medium text-white/90">
          평균 ELO {Math.round(team.avgElo)}
        </span>
      </div>

      {/* Member count sub-header */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-700/60">
        <Users size={16} aria-hidden="true" className={teamColor} />
        <span className={`text-xs font-medium ${teamColor}`}>
          {team.members.length}명
        </span>
      </div>

      {/* Member list */}
      <div className="px-4 pb-2 divide-y divide-gray-50 dark:divide-gray-700/50">
        {team.members.map((member) => (
          <MemberRow key={member.userId} member={member} />
        ))}
      </div>
    </div>
  );
}

// ── Config step ───────────────────────────────────────────────────────────────

function ConfigStep({
  teamCount,
  strategy,
  onTeamCountChange,
  onStrategyChange,
  onPreview,
  isPending,
  participantCount,
  previewButtonRef,
}: {
  teamCount: number;
  strategy: 'balanced' | 'random';
  onTeamCountChange: (n: number) => void;
  onStrategyChange: (s: 'balanced' | 'random') => void;
  onPreview: () => void;
  isPending: boolean;
  participantCount?: number;
  previewButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const teamOptions = [2, 3, 4];
  const tooFewParticipants =
    participantCount !== undefined && participantCount < 2;

  return (
    <div className="flex flex-col gap-5">
      {/* Team count selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          팀 수
        </label>
        <div className="flex gap-2">
          {teamOptions.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onTeamCountChange(n)}
              aria-pressed={teamCount === n}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                teamCount === n
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {n}팀
            </button>
          ))}
        </div>
      </div>

      {/* Strategy toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          배정 방식
        </label>
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-600">
          <button
            type="button"
            onClick={() => onStrategyChange('balanced')}
            aria-pressed={strategy === 'balanced'}
            className={`flex-1 flex flex-col items-center py-3 text-sm font-medium transition-colors min-h-[44px] rounded-l-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
              strategy === 'balanced'
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <span>ELO 균형</span>
            <span className={`text-2xs mt-0.5 ${strategy === 'balanced' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>실력 기반 균등 배정</span>
          </button>
          <button
            type="button"
            onClick={() => onStrategyChange('random')}
            aria-pressed={strategy === 'random'}
            className={`flex-1 flex flex-col items-center py-3 text-sm font-medium transition-colors min-h-[44px] rounded-r-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 border-l border-gray-200 dark:border-gray-600 ${
              strategy === 'random'
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <span>랜덤</span>
            <span className={`text-2xs mt-0.5 ${strategy === 'random' ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>무작위 배정</span>
          </button>
        </div>
      </div>

      {/* Hint text when too few participants */}
      {tooFewParticipants && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">
          확정 참가자가 2명 이상이어야 팀을 구성할 수 있어요.
        </p>
      )}

      {/* Preview CTA */}
      <button
        ref={previewButtonRef}
        type="button"
        onClick={onPreview}
        disabled={isPending || tooFewParticipants}
        aria-disabled={isPending || tooFewParticipants}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-base font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {isPending ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              aria-hidden="true"
            />
            분석 중...
          </>
        ) : (
          <>
            <Sparkles size={16} aria-hidden="true" />
            미리보기
          </>
        )}
      </button>
    </div>
  );
}

// ── Preview step ──────────────────────────────────────────────────────────────

function PreviewStep({
  preview,
  previewHistory,
  teamCount,
  sportType,
  onRetry,
  onConfirm,
  onBackToConfig,
  onConfirmWithHistorySeed,
  isRetrying,
  isConfirming,
  retryButtonRef,
  confirmButtonRef,
  retryCountdown,
}: {
  preview: PreviewTeamsResponse;
  previewHistory: PreviewResult[];
  teamCount: number;
  sportType?: string;
  onRetry: () => void;
  onConfirm: () => void;
  onBackToConfig: () => void;
  onConfirmWithHistorySeed: (seed: number, participantHash?: string) => void;
  isRetrying: boolean;
  isConfirming: boolean;
  retryButtonRef: React.RefObject<HTMLButtonElement | null>;
  confirmButtonRef: React.RefObject<HTMLButtonElement | null>;
  retryCountdown: number | null;
}) {
  // Toggle between current preview and a historical snapshot
  const [showingHistoryIndex, setShowingHistoryIndex] = useState<number | null>(null);

  // Reset history view when a new preview arrives (current preview changed)
  useEffect(() => {
    setShowingHistoryIndex(null);
  }, [preview]);

  const historyCount = previewHistory.length;
  const isViewingHistory = showingHistoryIndex !== null;

  // The data to display: either the active historical snapshot or the current preview
  const displayedPreview =
    showingHistoryIndex !== null ? previewHistory[showingHistoryIndex] : preview;

  const badge = getBalanceBadge(displayedPreview.metrics.maxEloGap);
  const hasColdStart = displayedPreview.metrics.coldStartCount > 0;

  // Header label for history toggle bar
  const historyLabel =
    historyCount >= 1
      ? `이전 결과 ${historyCount}건 · 현재 결과`
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* History toggle bar — only visible when there is at least 1 previous result */}
      {historyLabel && (
        <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {historyLabel}
          </span>
          <div className="flex items-center gap-1">
            {previewHistory.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  setShowingHistoryIndex(showingHistoryIndex === idx ? null : idx)
                }
                aria-pressed={showingHistoryIndex === idx}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                  showingHistoryIndex === idx
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label={`이전 결과 ${idx + 1} 보기`}
              >
                {showingHistoryIndex === idx ? (
                  <ChevronLeft size={12} aria-hidden="true" />
                ) : (
                  <ChevronRight size={12} aria-hidden="true" />
                )}
                {`이전 ${idx + 1}`}
              </button>
            ))}
            {isViewingHistory && (
              <button
                type="button"
                onClick={() => setShowingHistoryIndex(null)}
                className="ml-1 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                현재 보기
              </button>
            )}
          </div>
        </div>
      )}

      {/* History view banner */}
      {isViewingHistory && (
        <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 px-3 py-2.5">
          <Info size={16} aria-hidden="true" className="shrink-0 mt-0.5 text-blue-500 dark:text-blue-400" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            이전 결과를 보고 있어요. 이 구성으로 확정하려면 아래 버튼을 누르세요.
          </p>
        </div>
      )}

      {/* Status region: balance badge + cold-start banner */}
      <div className="flex flex-col gap-2">
        {/* Balance badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            팀 구성 결과
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        {/* ELO gap sub-info */}
        <div className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
          <span>최대 ELO 격차: {displayedPreview.metrics.maxEloGap}</span>
          <span aria-hidden="true">·</span>
          <span>표준편차: {displayedPreview.metrics.stdDev.toFixed(1)}</span>
        </div>

        {/* Cold-start banner */}
        {hasColdStart && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 px-3 py-2.5"
          >
            <Info
              size={16}
              aria-hidden="true"
              className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
            />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              ELO 미등록{' '}
              <span className="font-semibold">
                {displayedPreview.metrics.coldStartCount}명
              </span>
              은 1000으로 가정해요. 경기 후 정확도가 높아져요.
            </p>
          </div>
        )}
      </div>

      {/* Team cards — C6: responsive 2-col grid for 3+ teams */}
      <div
        className={`grid gap-3 ${
          teamCount >= 3
            ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        {displayedPreview.teams.map((team) => (
          <TeamCard key={team.index} team={team} sportType={sportType} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        {/* Back to config — tertiary text button, left-aligned */}
        {!isViewingHistory && (
          <button
            type="button"
            onClick={onBackToConfig}
            disabled={isRetrying || isConfirming}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors min-h-[44px] px-1 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            ← 설정 변경
          </button>
        )}

        {/* Right-aligned CTA group */}
        <div className="flex-1 flex gap-3">
          {isViewingHistory ? (
            // When viewing a historical result: "이 구성으로 확정" replaces retry+confirm
            <button
              type="button"
              onClick={() => onConfirmWithHistorySeed(displayedPreview.seed, displayedPreview.participantHash)}
              disabled={isConfirming}
              className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              이 구성으로 확정
            </button>
          ) : (
            <>
              <button
                ref={retryButtonRef}
                type="button"
                onClick={onRetry}
                disabled={isRetrying || isConfirming || retryCountdown !== null}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {isRetrying ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent"
                      aria-hidden="true"
                    />
                    <span>재추첨 중</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} aria-hidden="true" />
                    <span>{retryCountdown !== null ? `재추첨 (${retryCountdown}초)` : '재추첨'}</span>
                  </>
                )}
              </button>

              <button
                ref={confirmButtonRef}
                type="button"
                onClick={onConfirm}
                disabled={isRetrying || isConfirming}
                className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {isConfirming ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                      aria-hidden="true"
                    />
                    확정 중...
                  </span>
                ) : (
                  '확정'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function AutoBalanceModal({
  matchId,
  open,
  onClose,
  onConfirmed,
  defaultTeamCount = 2,
  sportType,
  participantCount,
  existingTeams,
}: AutoBalanceModalProps) {
  const [step, setStep] = useState<Step>('config');
  const [teamCount, setTeamCount] = useState<number>(
    Math.max(2, Math.min(4, defaultTeamCount)),
  );
  const [strategy, setStrategy] = useState<'balanced' | 'random'>('balanced');
  const [currentPreview, setCurrentPreview] =
    useState<PreviewTeamsResponse | null>(null);

  // C4: FIFO history of the last 2 preview results (session-scoped).
  // Reset to [] on modal close.
  const [previewHistory, setPreviewHistory] = useState<PreviewResult[]>([]);

  // C5: Controls whether ConfirmReplaceModal is visible
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  // aria-live announcement for PARTICIPANTS_CHANGED auto-repreview (C2)
  const [announcementText, setAnnouncementText] = useState('');

  // C3: countdown seconds for 429 rate-limit (null = no limit active)
  const [countdown, setCountdown] = useState<number | null>(null);

  // Refs for focus management on step change
  const previewButtonRef = useRef<HTMLButtonElement | null>(null);
  const retryButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const previewMutation = usePreviewTeams(matchId);
  const { retryAfterSeconds } = previewMutation;

  const composeMutation = useComposeTeams(matchId, {
    onParticipantsChanged: (input) => {
      previewMutation.mutate(input, {
        onSuccess: (d) => {
          setCurrentPreview(d);
          setStep('preview');
          setAnnouncementText('참가자가 변경되어 다시 계산했어요');
        },
      });
    },
  });

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep('config');
      setTeamCount(Math.max(2, Math.min(4, defaultTeamCount)));
      setStrategy('balanced');
      setCurrentPreview(null);
      setPreviewHistory([]); // C4: session reset on close
      setShowReplaceModal(false);
      setAnnouncementText('');
      setCountdown(null);
      previewMutation.reset();
      composeMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-focus primary CTA on step change
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (step === 'config') {
        previewButtonRef.current?.focus();
      } else if (step === 'preview') {
        confirmButtonRef.current?.focus();
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [step, open]);

  // C3: Start 1-second countdown when server rate-limits the preview endpoint (429).
  // Clear on successful preview (retryAfterSeconds resets to null) or when timer expires.
  useEffect(() => {
    if (retryAfterSeconds === null) {
      setCountdown(null);
      return;
    }
    setCountdown(retryAfterSeconds);
    setAnnouncementText(`재추첨은 ${retryAfterSeconds}초 후 가능해요.`);
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          setAnnouncementText('');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [retryAfterSeconds]);

  /** Push a new preview result into the FIFO history (cap 2). */
  function pushToHistory(prev: PreviewResult) {
    setPreviewHistory((h) => [...h, prev].slice(-2));
  }

  function handlePreview() {
    const input: ComposeTeamsInput = { teamCount, strategy };
    previewMutation.mutate(input, {
      onSuccess: (data) => {
        setCurrentPreview(data);
        setStep('preview');
        previewMutation.reset();
      },
    });
  }

  function handleRetry() {
    // Save current preview into history before replacing it
    if (currentPreview) {
      pushToHistory(currentPreview);
    }
    // Clear stale compose error so its banner disappears during the new preview load
    composeMutation.reset();
    // No seed passed — server generates a new one
    const input: ComposeTeamsInput = { teamCount, strategy };
    previewMutation.mutate(input, {
      onSuccess: (data) => {
        setCurrentPreview(data);
        // Stay on preview step
      },
    });
  }

  function handleBackToConfig() {
    previewMutation.reset();
    composeMutation.reset();
    setCurrentPreview(null);
    setStep('config');
    // teamCount and strategy are preserved (not reset here)
  }

  /**
   * Fires the actual compose mutation using the given seed and participantHash.
   * Shared by both "확정" (current preview) and "이 구성으로 확정" (history snapshot).
   * The participantHash enables server-side stale-detection (409 PARTICIPANTS_CHANGED).
   */
  function fireCompose(seed: number, participantHash?: string) {
    setStep('confirming');
    const input: ComposeTeamsInput = {
      teamCount,
      strategy,
      seed,
      ...(participantHash !== undefined && { participantHash }),
    };
    composeMutation.mutate(input, {
      onSuccess: () => {
        onConfirmed?.();
        onClose();
      },
      onError: () => {
        setStep('preview');
      },
    });
  }

  /** Called when the user taps "확정" on the current preview. */
  function handleConfirm() {
    if (!currentPreview) return;
    const hasExistingTeams = existingTeams && existingTeams.length > 0;
    if (hasExistingTeams) {
      // C5: show replace warning before committing
      setShowReplaceModal(true);
    } else {
      fireCompose(currentPreview.seed, currentPreview.participantHash);
    }
  }

  /** Called when the user taps "이 구성으로 확정" from the history view. */
  function handleConfirmWithHistorySeed(seed: number, participantHash?: string) {
    const hasExistingTeams = existingTeams && existingTeams.length > 0;
    if (hasExistingTeams) {
      // Store the historical seed + hash temporarily, then open replace modal.
      setShowReplaceModal(true);
      _pendingHistoryRef.current = { seed, participantHash };
    } else {
      fireCompose(seed, participantHash);
    }
  }

  // Holds a historical seed + hash when ConfirmReplaceModal is opened via history CTA
  const _pendingHistoryRef = useRef<{ seed: number; participantHash?: string } | null>(null);

  function handleReplaceConfirm() {
    setShowReplaceModal(false);
    const pending = _pendingHistoryRef.current;
    _pendingHistoryRef.current = null;
    if (pending !== null) {
      fireCompose(pending.seed, pending.participantHash);
    } else if (currentPreview) {
      fireCompose(currentPreview.seed, currentPreview.participantHash);
    }
  }

  function handleReplaceCancel() {
    setShowReplaceModal(false);
    _pendingHistoryRef.current = null;
  }

  // Determine modal title
  const titleMap: Record<Step, string> = {
    config: '팀 자동 구성',
    preview: '팀 구성 미리보기',
    confirming: '팀 구성 중...',
  };

  // Determine if preview mutation errored (shown on config step, and also on preview step after a failed retry)
  const showPreviewError = (step === 'config' || step === 'preview') && previewMutation.isError;
  const showComposeError = step === 'preview' && composeMutation.isError;

  return (
    <>
      {/* aria-live region for PARTICIPANTS_CHANGED re-preview announcements (C2) */}
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
      >
        {announcementText}
      </div>

      <Modal
        isOpen={open}
        onClose={onClose}
        title={titleMap[step]}
        size="md"
      >
        {/* Intro text */}
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 -mt-3 leading-relaxed">
          {step === 'config'
            ? '팀 수와 배정 방식을 선택하면 팀을 만들어 드릴게요.'
            : step === 'preview'
              ? '결과가 마음에 들지 않으면 재추첨하거나 확정해 주세요.'
              : '잠시만요, 팀을 구성하고 있어요.'}
        </p>

        {/* Preview error banner */}
        {showPreviewError && (
          <div className="mb-4">
            <ErrorState
              message={extractErrorMessage(previewMutation.error, '팀 미리보기를 가져오지 못했어요.')}
              onRetry={() => {
                previewMutation.reset();
                handlePreview();
              }}
            />
          </div>
        )}

        {/* Compose error banner (stays on preview step) */}
        {showComposeError && (
          <div className="mb-4">
            <ErrorState
              message={extractErrorMessage(composeMutation.error, '팀 구성을 확정하지 못했어요.')}
              onRetry={() => {
                composeMutation.reset();
                handleConfirm();
              }}
            />
          </div>
        )}

        {/* Step content */}
        {step === 'config' && (
          <ConfigStep
            teamCount={teamCount}
            strategy={strategy}
            onTeamCountChange={setTeamCount}
            onStrategyChange={setStrategy}
            onPreview={handlePreview}
            isPending={previewMutation.isPending}
            participantCount={participantCount}
            previewButtonRef={previewButtonRef}
          />
        )}

        {(step === 'preview' || step === 'confirming') && currentPreview && (
          <PreviewStep
            preview={currentPreview}
            previewHistory={previewHistory}
            teamCount={teamCount}
            sportType={sportType}
            onRetry={handleRetry}
            onConfirm={handleConfirm}
            onBackToConfig={handleBackToConfig}
            onConfirmWithHistorySeed={handleConfirmWithHistorySeed}
            isRetrying={previewMutation.isPending}
            isConfirming={step === 'confirming' || composeMutation.isPending}
            retryButtonRef={retryButtonRef}
            confirmButtonRef={confirmButtonRef}
            retryCountdown={countdown}
          />
        )}

        {/* Confirming loading overlay (no preview data edge case) */}
        {step === 'confirming' && !currentPreview && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <span
              className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
              aria-hidden="true"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              팀을 구성하고 있어요...
            </p>
          </div>
        )}
      </Modal>

      {/* C5: Confirm replace modal — rendered outside the parent Modal to avoid
          z-index stacking issues. Uses role="alertdialog" per task 72 A3. */}
      <ConfirmReplaceModal
        open={showReplaceModal}
        onClose={handleReplaceCancel}
        onConfirm={handleReplaceConfirm}
        currentTeams={existingTeams ?? []}
        loading={step === 'confirming' || composeMutation.isPending}
      />
    </>
  );
}

