'use client';

import { Button } from '@/components/v1-ui/button';
import { useTournamentPeriodSettings } from '@/hooks/use-tournament-period-settings';
import { useV1AdminTournament, useV1LineupSizeOptions, useV1MasterSports } from '@/hooks/use-v1-api';
import { josa } from '@/lib/korean';
import { InfoBadge } from './info-forms/form-kit';
import { INFO_SECTIONS } from './info-forms/registry';
import type { InfoSummaryContext } from './info-forms/types';
import { InfoSectionSheet } from './info-section-sheet';
import { tournamentInfoNeeds, type InfoNeed, type InfoNeedKey, type TournamentInfoSectionKey } from './info-sections';
import { InfoSummaryCard } from './info-summary-card';
import { useTournamentAdmin } from './tournament-admin-context';
import { useInfoEditParam } from './use-info-edit-param';

/** 「필요」 항목이 가리키는 입력칸 — 시트가 열릴 때 그 칸에 초점을 둔다. */
const NEED_FIELD: Partial<Record<InfoNeedKey, string>> = {
  venue: 'venue',
  'roster-deadline': 'rosterDeadlineAt',
  'bank-account': 'bankAccount',
  'registration-deadline': 'registrationDeadlineAt',
  'scheduled-at': 'scheduledAt',
};

const joinLabels = (needs: readonly InfoNeed[]) => needs.map((need) => need.label).join('·');

/**
 * 대회 정보 — 섹션 여섯 개의 읽기 요약과, 주소의 `?edit=<섹션>` 으로 여닫는 수정 시트 하나.
 * 평소 화면에는 입력칸이 없다.
 */
export function TournamentInfoSection() {
  const { tournamentId: id, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(id);
  const { data: sports } = useV1MasterSports();
  const { data: lineupOptions } = useV1LineupSizeOptions(tournament?.sportId ?? null);
  const { data: periods } = useTournamentPeriodSettings(id);
  const { section, open, close } = useInfoEditParam();

  // 불러오는 중·실패는 셸(layout)이 보여 준다.
  if (!tournament) return null;

  const context: InfoSummaryContext = {
    tournament,
    sportName: sports?.find((sport) => sport.id === tournament.sportId)?.name,
    lineupOptions,
    periods,
  };
  const needs = tournamentInfoNeeds(tournament).filter((need) => need.tier === 'required');
  const needSections = [...new Set(needs.map((need) => need.section))];
  const editing = canWrite && section ? INFO_SECTIONS.find((definition) => definition.key === section) : undefined;
  const focusNeed = needs.find((need) => need.section === section);

  return (
    <div className="tm-content-enter flex flex-col gap-4">
      {needs.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--tint-orange-border)] bg-[var(--tint-orange)] px-4 py-2 text-[length:var(--font-size-body-sm)] text-[var(--orange700)]"
        >
          <InfoBadge tone="needed">채워야 할 것 {needs.length}</InfoBadge>
          <span className="min-w-0 flex-1 basis-48">{josa(joinLabels(needs), ['이', '가'])} 비어 있어요.</span>
          {canWrite
            ? needSections.map((key: TournamentInfoSectionKey) => (
                <Button key={key} type="button" variant="ghost" size="sm" className="text-[var(--orange700)]" onClick={() => open(key)}>
                  {joinLabels(needs.filter((need) => need.section === key))} 입력하기
                </Button>
              ))
            : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {INFO_SECTIONS.map((definition) => (
          <InfoSummaryCard key={definition.key} definition={definition} context={context} canWrite={canWrite} onEdit={open} />
        ))}
      </div>

      {editing ? (
        <InfoSectionSheet
          key={editing.key}
          definition={editing}
          initialTournament={tournament}
          focusField={focusNeed ? NEED_FIELD[focusNeed.key] : undefined}
          onClose={close}
          onSaved={(message) => showToast(message, 'success')}
        />
      ) : null}
    </div>
  );
}
