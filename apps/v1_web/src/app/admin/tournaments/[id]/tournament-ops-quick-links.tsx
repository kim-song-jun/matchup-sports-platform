'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useV1TournamentStaffAssignments } from '@/hooks/use-v1-api';
import { tournamentOpsAccessDeniedLabel, tournamentStaffDenialReasonCode } from '@/lib/tournament-ops-access';

/**
 * T6-5(D-16) — "보여주되 비활성 + 이유". `/tournament-ops` 셸 진입 가능 여부는
 * `GET .../staff`(TournamentStaffAccessService.assertAccess, action='read')가
 * 판정하는 것과 정확히 같은 신호를 그대로 재사용한다 — 클릭했을 때 실제로 막힐
 * 바로 그 엔드포인트를 미리 조회해 버튼 상태를 맞춘다(별도 프론트 권한 모델을
 * 새로 만들지 않는다).
 */
export function TournamentOpsQuickLinks({ tournamentId }: { tournamentId: string }) {
  const staffAssignments = useV1TournamentStaffAssignments(tournamentId);

  let reasonLabel: string | undefined;
  if (staffAssignments.isPending) {
    reasonLabel = '확인 중…';
  } else if (staffAssignments.isError) {
    reasonLabel = tournamentOpsAccessDeniedLabel(tournamentStaffDenialReasonCode(staffAssignments.error));
  }

  const links = [
    { href: `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/staff?from=admin`, label: '스태프 배정 콘솔' },
    { href: `/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/operations?from=admin`, label: '운영 보드' },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {links.map((link) =>
        reasonLabel ? (
          <button
            key={link.href}
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex flex-col items-start min-h-[44px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap text-gray-400 bg-gray-100 cursor-not-allowed text-left"
          >
            <span>{link.label}</span>
            <span className="text-[10px] font-normal text-gray-400">{reasonLabel}</span>
          </button>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium whitespace-nowrap text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {link.label}
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        ),
      )}
    </div>
  );
}
