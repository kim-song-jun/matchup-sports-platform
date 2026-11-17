import { ExternalLink, Lock } from 'lucide-react';
import { formatKstDotDate, formatKstDotMonthDay } from '@/lib/date-utils';
import type {
  V1PlayerEligibilityMethod,
  V1PlayerEligibilityStatus,
} from '@/types/api';
import {
  PLAYER_ELIGIBILITY_CRITERIA_TEXT,
  PLAYER_ELIGIBILITY_LABEL,
  PLAYER_ELIGIBILITY_METHOD_LABEL,
} from '@/lib/v1-status-labels';

/**
 * 선출 여부 확인 공통 조각(MD-QA #192). 어드민 명단 검토·팀장 명단·선수 본인 신고가 같은 문구와 링크를 쓴다.
 *
 * **JoinKFA 와는 링크로만 이어진다.** 공식 API 가 없고 robots.txt 가 전면 차단이라 서버·클라이언트
 * 어디서도 joinkfa.com 에 요청을 보내지 않는다. 루트 주소를 새 탭으로 여는 일반 링크뿐이고,
 * KFA 로고·상표는 쓰지 않는다(제휴처럼 읽히지 않게).
 */
export const JOINKFA_URL = 'https://www.joinkfa.com';

export const JOINKFA_PRIVACY_NOTE = 'Teameet은 JoinKFA에 선수 정보를 보내지 않아요.';

/**
 * 증명서 위치 안내(MD-QA #192 후속). 2026-11-11 joinkfa.com 실측: 상단 '증명서 → 증명서 신청'이고
 * 회원 전용(로그인 필요)이라 선수 본인만 발급한다. KFA 쪽 메뉴가 바뀌면 이 문구만 고친다 — 링크는 계속 루트만.
 */
export const JOINKFA_CERTIFICATE_GUIDE =
  "선수 본인이 JoinKFA에 로그인한 뒤 상단 '증명서 → 증명서 신청'에서 경력·실적 증명서를 받을 수 있어요.";

export const SELF_DECLARATION_CONSENT_TEXT = '허위로 신고하면 대회 규정에 따라 출전 제한·실격이 될 수 있어요.';

export const ELIGIBILITY_METHODS: readonly V1PlayerEligibilityMethod[] = [
  'joinkfa',
  'certificate',
  'self_presented',
  'self_declared',
  'other',
];

export function JoinKfaLink({ label = 'JoinKFA에서 등록 이력 보기', className }: { label?: string; className?: string }) {
  return (
    <a
      href={JOINKFA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        'inline-flex min-h-[44px] items-center gap-1 rounded-lg font-semibold text-[var(--blue700)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)] text-[length:var(--font-size-label)]'
      }
    >
      {label}
      <ExternalLink size={14} aria-hidden="true" />
      <span className="sr-only">(새 탭에서 열려요)</span>
    </a>
  );
}

/** 팀장·선수 화면의 선출 기준 안내 — 기준 문장 + JoinKFA 링크 + 증명서 위치 + 정보 전송 없음 고지. */
export function EligibilityCriteriaHelp({ id }: { id?: string }) {
  return (
    <div id={id} className="mt-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2">
      <p className="m-0 text-[length:var(--font-size-caption)] leading-relaxed text-[var(--text-body)]">
        {PLAYER_ELIGIBILITY_CRITERIA_TEXT} 운영진이 다시 확인하고, 확인한 선수는 자물쇠가 표시돼요.
      </p>
      <JoinKfaLink />
      <p className="m-0 text-[length:var(--font-size-micro)] text-[var(--text-muted)]">{JOINKFA_CERTIFICATE_GUIDE}</p>
      <p className="m-0 text-[length:var(--font-size-micro)] text-[var(--text-caption)]">{JOINKFA_PRIVACY_NOTE}</p>
    </div>
  );
}

/** "운영진 확인 완료(JoinKFA)" 잠금 표시. 방법을 모르면(옛 판정·가려진 행) 괄호를 생략한다. */
export function EligibilityLockedNote({ method }: { method: V1PlayerEligibilityMethod | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--font-size-micro)] font-semibold text-[var(--text-muted)]">
      <Lock size={12} aria-hidden="true" />
      {method ? `운영진 확인 완료(${PLAYER_ELIGIBILITY_METHOD_LABEL[method]})` : '운영진 확인 완료'}
    </span>
  );
}

/** `MM.DD` — 근거 줄은 짧아야 한 줄에 들어간다. 포맷 정의는 `lib/date-utils.ts`가 단일 소스다. */
export function formatEvidenceDate(iso: string): string {
  return formatKstDotMonthDay(iso) ?? '';
}

/** `YYYY.MM.DD` — 이전 판정은 다른 해일 수 있어 연도를 붙인다. */
export function formatEvidenceFullDate(iso: string): string {
  return formatKstDotDate(iso) ?? '';
}

/** 팀장 선택과 본인 신고가 엇갈리는가 — 둘 다 값이 있고 다를 때만. */
export function eligibilityDeclarationMismatch(
  status: V1PlayerEligibilityStatus,
  selfDeclared: Exclude<V1PlayerEligibilityStatus, 'needs_review'> | null | undefined,
): boolean {
  return Boolean(selfDeclared) && status !== 'needs_review' && status !== selfDeclared;
}

export function eligibilityLabel(status: V1PlayerEligibilityStatus): string {
  return PLAYER_ELIGIBILITY_LABEL[status] ?? '알 수 없음';
}
