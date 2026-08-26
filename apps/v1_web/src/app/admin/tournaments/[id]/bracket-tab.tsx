'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, RefreshCw, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { isBracketPublished as isBracketPublishedNow } from '@/lib/bracket-visibility';
import { onlyDigits } from '@/lib/number-format';
import { useV1PublishTournamentBracket, useV1UnpublishTournamentBracket, useV1AdminBracket, useV1CreateGroup, useV1AssignGroupTeam, useV1CreateFixture, useV1RecalculateStandings, useV1UpdateFixture, useV1DeleteFixture, useV1UpdateGroup, useV1DeleteGroup, useV1RemoveGroupTeam } from '@/hooks/use-v1-api';
import type {
  V1AdminTournamentRegistration,
  V1AdminBracketGroup,
  V1AdminBracketFixture,
  V1GenerateLeagueFixturesResponse,
} from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError, v1Post } from '@/lib/api-client';
// 조별리그 라운드로빈은 서버(POST /admin/tournaments/:id/league/fixtures/generate)로 이관했다.
// 여기 남는 knockoutSeedPairs 는 녹아웃 시드 페어링 전용이다.
import { knockoutSeedPairs } from '@/lib/tournament-bracket-gen';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { BracketGroupQuickAdd } from './bracket-group-quick-add';
import { BracketGroupCard } from './bracket-group-card';
import { isGroupReady } from './bracket-group-helpers';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { formatDate } from './tournament-admin-shared';
import {
  SimpleModal,
  inputCls,
  isoToDatetimeLocalValue,
  submitBtnCls,
} from './tournament-detail-shared';


/**
 * 서버가 `LEAGUE_FIXTURES_ALREADY_EXIST`(409) 와 함께 주는 사전 영향 요약. 이 숫자들을 보고
 * 운영자가 "교체" 를 누를지 결정한다 — API 계약은
 * `apps/v1_api/src/tournaments/league-fixture-generator.service.ts` 의
 * `LeagueFixtureReplaceImpact`.
 */
interface LeagueReplaceImpact {
  existingFixtureCount: number;
  fixturesWithResultCount: number;
  blockedFixtureCount: number;
  replaceable: boolean;
}

function readCount(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 교체 확인 문구를 만든다. **무엇이 사라지는지 숫자로** 말해야 한다 — 자동 생성 한 번이
 * 8팀 조 2회전이면 대진 56개를 만들고, 교체는 그걸 전부 지운다.
 *
 * 막힌 이유는 개수까지만 말한다. 어느 대진이 왜 막혔는지는 서버가 실제 교체 요청에 대한
 * 응답 message 로 이름까지 붙여 주므로(`LEAGUE_FIXTURES_NOT_DELETABLE`), 같은 문구를 여기서
 * 다시 조립하지 않는다.
 *
 * `details` 가 없거나 모양이 다르면(구버전 서버·프록시가 본문을 잘라낸 경우) 숫자를 지어내지
 * 않는다. 대신 숫자 없는 문구로 확인만 받는다 — 0개라고 잘못 말하면 운영자가 안심하고 누른다.
 */
export function describeLeagueReplace(details: unknown): { replaceable: boolean; message: string } {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) {
    return {
      replaceable: true,
      message: '이미 대진이 있어요. 교체하면 기존 대진이 모두 삭제돼요. 계속할까요?',
    };
  }
  const source = details as Record<string, unknown>;
  const impact: LeagueReplaceImpact = {
    existingFixtureCount: readCount(source, 'existingFixtureCount'),
    fixturesWithResultCount: readCount(source, 'fixturesWithResultCount'),
    blockedFixtureCount: readCount(source, 'blockedFixtureCount'),
    replaceable: source.replaceable !== false,
  };

  if (!impact.replaceable) {
    const reasons: string[] = [];
    if (impact.fixturesWithResultCount > 0) {
      reasons.push(`결과가 확정된 경기 ${impact.fixturesWithResultCount}개`);
    }
    if (impact.blockedFixtureCount > 0) {
      reasons.push(`기록이 남아 지울 수 없는 대진 ${impact.blockedFixtureCount}개`);
    }
    const reason = reasons.length > 0 ? reasons.join('와 ') : '지울 수 없는 대진';
    return {
      replaceable: false,
      message: `${reason}가 있어 대진을 다시 만들 수 없어요. 각 경기의 "수정" 으로 팀과 일시를 바꿔주세요.`,
    };
  }

  return {
    replaceable: true,
    message:
      `기존 대진 ${impact.existingFixtureCount}개가 모두 삭제되고 새 대진이 만들어져요. ` +
      '삭제한 대진은 되돌릴 수 없어요. 계속할까요?',
  };
}

// ── Tab: Bracket ──────────────────────────────────────────────────────────

export function BracketTab({
  tournamentId,
  showToast,
  registrations,
  registrationDeadlineAt,
  bracketPublishedAt,
  bracketPublishScheduledAt,
  canWrite,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
  registrations: V1AdminTournamentRegistration[];
  registrationDeadlineAt: string | null | undefined;
  bracketPublishedAt: string | null | undefined;
  bracketPublishScheduledAt: string | null | undefined;
  canWrite: boolean;
}) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const createGroup = useV1CreateGroup(tournamentId);
  const assignGroupTeam = useV1AssignGroupTeam(tournamentId);
  const createFixture = useV1CreateFixture(tournamentId);
  const recalculate = useV1RecalculateStandings(tournamentId);
  const updateFixture = useV1UpdateFixture(tournamentId);
  const deleteFixture = useV1DeleteFixture(tournamentId);
  const updateGroup = useV1UpdateGroup(tournamentId);
  const deleteGroup = useV1DeleteGroup(tournamentId);
  const publishBracket = useV1PublishTournamentBracket(tournamentId);
  const unpublishBracket = useV1UnpublishTournamentBracket(tournamentId);
  const removeGroupTeam = useV1RemoveGroupTeam(tournamentId);
  // datetime-local 입력값(로컬 시각 문자열). 예약 성공 시 비운다.
  const [publishScheduleInput, setPublishScheduleInput] = useState('');

  // ── 경기 수정 모달 상태 ─────────────────────────────────────────────
  const [editFixture, setEditFixture] = useState<V1AdminBracketFixture | null>(null);
  const [editFxScheduledAt, setEditFxScheduledAt] = useState('');
  const [editFxVenue, setEditFxVenue] = useState('');
  const [editFxHomeRegId, setEditFxHomeRegId] = useState('');
  const [editFxAwayRegId, setEditFxAwayRegId] = useState('');

  // ── 조 수정 모달 상태 ───────────────────────────────────────────────
  const [editGroup, setEditGroup] = useState<V1AdminBracketGroup | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupAdvance, setEditGroupAdvance] = useState('');

  // 조 카드 트리 — 그룹 생성 폼·팀 배정 폼·픽스처 생성 폼은 각 조 카드(bracket-group-card.tsx)
  // 안으로 이동했다(설계안 B). 여기 남는 건 "방금 만든 조로 스크롤" 신호뿐.
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const { confirm: confirmModal, ConfirmModal } = useConfirm();

  // ── 조별리그 대진 자동 생성(서버 API, 회전 수 선택) ────────────────
  // 이 컴포넌트의 다른 mutation 은 전용 훅(`hooks/use-v1-api.ts`)이 React Query 캐시
  // invalidate 를 담당하지만, 신규 리그 API 는 그 파일을 건드리지 않도록
  // v1Post 직접 호출 + 로컬 pending state + useV1AdminBracket 의 refetch() 로 구현했다.
  const [isGeneratingLeague, setIsGeneratingLeague] = useState(false);
  const [legsPickerGroupId, setLegsPickerGroupId] = useState<string | null>(null);
  const [legsPickerValue, setLegsPickerValue] = useState<'1' | '2'>('1');

  const confirmedRegistrations = registrations.filter((r) => r.status === 'confirmed');
  // EntityPicker 어댑터 — 팀 select 자리에 쓸 아이템 목록(제출 payload는 계속 registrationId 문자열)
  const confirmedTeamItems: EntityPickerItem[] = confirmedRegistrations.map((r) => ({
    id: r.id,
    label: r.teamName ?? r.teamId,
  }));
  const editFixtureTeamItems: EntityPickerItem[] = confirmedRegistrations.map((r) => ({
    id: r.id,
    label: r.teamName ?? r.id,
  }));

  const handleUpdateFixture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFixture) return;
    const changesTeams =
      editFxHomeRegId !== (editFixture.homeRegistrationId ?? '') ||
      editFxAwayRegId !== (editFixture.awayRegistrationId ?? '');
    updateFixture.mutate(
      {
        fixtureId: editFixture.id,
        ...(editFxScheduledAt ? { scheduledAt: new Date(editFxScheduledAt).toISOString() } : {}),
        venue: editFxVenue,
        ...(changesTeams && editFxHomeRegId ? { homeRegistrationId: editFxHomeRegId } : {}),
        ...(changesTeams && editFxAwayRegId ? { awayRegistrationId: editFxAwayRegId } : {}),
      },
      {
        onSuccess: () => { setEditFixture(null); showToast('경기 정보를 수정했어요.', 'success'); },
        onError: (err) => showToast(extractErrorMessage(err, '경기 수정에 실패했어요.'), 'error'),
      },
    );
  };

  const handleDeleteFixture = async (f: V1AdminBracketFixture) => {
    const ok = await confirmModal({
      title: '경기 삭제',
      message: `${f.round} ${f.fixtureNumber}번 경기를 삭제할까요? 되돌릴 수 없어요.`,
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    deleteFixture.mutate(f.id, {
      onSuccess: () => showToast('경기를 삭제했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '경기 삭제에 실패했어요.'), 'error'),
    });
  };

  const handleUpdateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGroup || !editGroupName.trim()) return;
    const parsed = Number.parseInt(editGroupAdvance, 10);
    updateGroup.mutate(
      {
        groupId: editGroup.id,
        name: editGroupName.trim(),
        ...(Number.isInteger(parsed) && parsed > 0 ? { advanceCount: parsed } : {}),
      },
      {
        onSuccess: () => { setEditGroup(null); showToast('조 정보를 수정했어요.', 'success'); },
        onError: (err) => showToast(extractErrorMessage(err, '조 수정에 실패했어요.'), 'error'),
      },
    );
  };

  const handleDeleteGroup = async (g: V1AdminBracketGroup) => {
    const ok = await confirmModal({
      title: '조 삭제',
      message: `"${g.name}"을(를) 삭제할까요? 팀 배정·경기가 남아 있으면 삭제할 수 없어요.`,
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    deleteGroup.mutate(g.id, {
      onSuccess: () => showToast('조를 삭제했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '조 삭제에 실패했어요.'), 'error'),
    });
  };

  const handleRemoveGroupTeam = async (groupTeamId: string, teamName: string) => {
    const ok = await confirmModal({
      title: '팀 배정 해제',
      message: `${teamName} 팀의 조 배정을 해제할까요? 해당 조 순위 기록도 함께 정리돼요.`,
      confirmLabel: '해제',
      tone: 'danger',
    });
    if (!ok) return;
    removeGroupTeam.mutate(groupTeamId, {
      onSuccess: () => showToast('팀 배정을 해제했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '배정 해제에 실패했어요.'), 'error'),
    });
  };

  // ── Auto-generate fixtures ───────────────────────────────────────────
  // Sequential mutation helper — fires each payload one at a time to avoid
  // race conditions on the server's auto-increment fixtureNumber logic.
  async function mutateSequential(payloads: Parameters<typeof createFixture.mutate>[0][]) {
    for (const payload of payloads) {
      await new Promise<void>((resolve, reject) => {
        createFixture.mutate(payload, { onSuccess: () => resolve(), onError: reject });
      });
    }
  }

  const handleAutoGenerate = async (targetGroupId: string) => {
    // Find the group (use bracket directly to avoid temporal dependency on groups/fixtures)
    const allGroups: V1AdminBracketGroup[] = bracket?.groups ?? [];
    const allFixtures: V1AdminBracketFixture[] = bracket?.fixtures ?? [];
    const group = allGroups.find((g) => g.id === targetGroupId);
    if (!group) return;

    const isKnockout = group.phase === 'semi' || group.phase === 'final' || group.phase === 'third_place';

    if (!isKnockout) {
      // GROUP phase — 조별리그 대진은 서버가 만든다. 회전 수(1회전/2회전)를 모달에서 고른 뒤
      // POST /admin/tournaments/:id/league/fixtures/generate 를 호출한다.
      // 기존 fixture 존재 여부·최소 경기 수 검증도 서버가 판정하므로 여기서 미리 묻지 않는다.
      if (group.groupTeams.length < 2) {
        showToast('조에 팀이 2개 이상 있어야 자동 생성할 수 있어요.', 'error');
        return;
      }
      setLegsPickerValue('1');
      setLegsPickerGroupId(targetGroupId);
      return;
    }

    // KNOCKOUT phase — 아래는 전부 녹아웃 시드 페어링 경로다.
    // Check for existing fixtures in this group
    const existingInGroup = allFixtures.filter((f) => f.groupId === targetGroupId);
    if (existingInGroup.length > 0) {
      const ok = await confirmModal({
        title: '경기 일정 추가',
        message: `"${group.name}"에 이미 경기 일정 ${existingInGroup.length}개가 있어요. 추가로 만들까요?`,
        confirmLabel: '추가 생성',
      });
      if (!ok) return;
    }

    // Determine next fixtureNumber base (global across all fixtures)
    const maxNum = allFixtures.reduce((m, f) => Math.max(m, f.fixtureNumber), 0);
    let nextNum = maxNum + 1;

    setIsAutoGenerating(true);
    try {
      {
        // KNOCKOUT phase — seed-pair: 1 vs N, 2 vs N-1, …
        const teams = group.groupTeams;
        const roundLabel =
          group.phase === 'semi'
            ? '4강'
            : group.phase === 'final'
            ? '결승'
            : '3·4위전';

        if (teams.length === 0) {
          // Produce a single TBD fixture for the phase
          await new Promise<void>((resolve, reject) => {
            createFixture.mutate(
              { groupId: targetGroupId, round: roundLabel, fixtureNumber: nextNum++ },
              { onSuccess: () => resolve(), onError: reject },
            );
          });
          showToast(`${roundLabel} 경기 일정(대진 미정)을 추가했어요.`, 'success');
          return;
        }

        // 시드순(sortOrder) 정렬 후 1vsN 페어링 (순수 함수 knockoutSeedPairs)
        const sorted = [...teams].sort((a, b) => a.sortOrder - b.sortOrder);
        const payloads: Parameters<typeof createFixture.mutate>[0][] = [];
        for (const { home, away } of knockoutSeedPairs(sorted)) {
          payloads.push({
            groupId: targetGroupId,
            round: roundLabel,
            fixtureNumber: nextNum++,
            homeRegistrationId: home.registrationId,
            ...(away ? { awayRegistrationId: away.registrationId } : {}),
          });
        }
        await mutateSequential(payloads);
        showToast(`${roundLabel} 경기 일정 ${payloads.length}개를 자동으로 만들었어요.`, 'success');
      }
    } catch (err) {
      showToast(extractErrorMessage(err, '자동 생성에 실패했어요.'), 'error');
    } finally {
      setIsAutoGenerating(false);
    }
  };

  // ── 조별리그 대진 생성 확정 — 회전 수 선택 모달의 "자동 생성" 클릭 ──
  const handleGenerateLeagueFixtures = async (replaceExisting: boolean) => {
    if (!legsPickerGroupId) return;
    const legs = Number(legsPickerValue);
    setIsGeneratingLeague(true);
    try {
      const res = await v1Post<V1GenerateLeagueFixturesResponse>(
        `/admin/tournaments/${tournamentId}/league/fixtures/generate`,
        { groupId: legsPickerGroupId, legs, replaceExisting },
      );
      setLegsPickerGroupId(null);
      await refetch();
      showToast(`조별리그 경기 일정 ${res.created}개를 자동으로 만들었어요.`, 'success');
      // 서버가 생성을 막지는 않지만 알아야 하는 사항(일정 미지정·홀수 팀 bye)을 함께 알린다.
      // 이걸 삼키면 관리자가 "일정이 비어 있다"를 나중에 현장에서 발견하게 된다.
      // 실패가 아니므로 error 로 띄우지 않고 기본 톤으로 알린다.
      for (const warning of res.warnings ?? []) {
        showToast(warning.message);
      }
    } catch (err) {
      if (err instanceof V1ApiError && err.code === 'LEAGUE_FIXTURES_ALREADY_EXIST') {
        const prompt = describeLeagueReplace(err.details);
        // 교체할 수 없는 조에는 확인 모달을 띄우지 않는다. 예전에는 "교체할까요?" 에 예라고
        // 답한 운영자를 곧바로 409 토스트로 떨어뜨렸다 — 물어보고 나서 거절하는 흐름이었다.
        if (!prompt.replaceable) {
          showToast(prompt.message, 'error');
          return;
        }
        const ok = await confirmModal({
          title: '대진 교체',
          message: prompt.message,
          confirmLabel: '교체',
          tone: 'danger',
        });
        if (ok) await handleGenerateLeagueFixtures(true);
        return;
      }
      // LEAGUE_MIN_MATCHES_NOT_MET·LEAGUE_FIXTURES_NOT_DELETABLE·
      // LEAGUE_FIXTURES_GENERATION_TIMEOUT·LEAGUE_REGISTRATION_NOT_CONFIRMED 등 그 외 코드는
      // 서버 message 를 그대로 노출한다 — 필요한 회전 수·막힌 대진 번호·문제 팀 이름이 이미
      // message 에 들어 있고, 여기서 다시 조립하면 두 문구가 갈라진다.
      showToast(extractErrorMessage(err, '자동 생성에 실패했어요.'), 'error');
    } finally {
      setIsGeneratingLeague(false);
    }
  };

  const handleRecalculate = () => {
    recalculate.mutate(undefined, {
      onSuccess: () => showToast('순위를 재계산했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '순위 재계산에 실패했어요.'), 'error'),
    });
  };

  if (isPending || isError) {
    return (
      <AdminDataTable
        columns={[]}
        rows={[]}
        keyExtractor={() => ''}
        loading={isPending}
        error={isError ? extractErrorMessage(error, '대진 정보를 불러오지 못했어요.') : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const groups: V1AdminBracketGroup[] = bracket?.groups ?? [];
  const fixtures: V1AdminBracketFixture[] = bracket?.fixtures ?? [];
  const allStandings = bracket?.standings ?? [];
  const readyGroupCount = groups.filter((g) => isGroupReady(g, fixtures)).length;

  // ── Task 109 Track 6: 대진표 일괄 공개 ─────────────────────────────
  // 예약 시각이 지나면 서버는 공개로 판정하지만 bracketPublishedAt 은 null 로 남는다.
  // 여기서 bracketPublishedAt 만 보면 이미 공개된 대진표를 계속 "예약됨"으로 표시하고
  // 공개 버튼도 노출하게 되므로, 서버와 같은 규칙(bracket-visibility)을 쓴다.
  const isBracketPublished = isBracketPublishedNow(bracketPublishedAt, bracketPublishScheduledAt);
  // 아직 오지 않은 예약만 "예약됨" 안내·취소 대상이다.
  const hasPendingSchedule = !!bracketPublishScheduledAt && !isBracketPublished;
  const deadlinePassed = registrationDeadlineAt
    ? new Date(registrationDeadlineAt).getTime() < Date.now()
    : false;
  // 조가 하나도 없으면 공개해도 참가팀에게 보여줄 대진이 없다. 실수로 빈 대진표를
  // 공개하는 사고를 막기 위해 공개·예약 진입 자체를 닫는다.
  const publishBlockedReason = groups.length === 0 ? '조를 먼저 만들어야 공개할 수 있어요.' : null;

  const runPublish = (scheduledAt?: string) => {
    publishBracket.mutate(scheduledAt ? { scheduledAt } : undefined, {
      onSuccess: (res) => {
        if (res.alreadyPublished) showToast('이미 공개된 대진표예요.', 'success');
        else if (res.bracketPublishScheduledAt)
          showToast(`${formatDate(res.bracketPublishScheduledAt)}에 공개되도록 예약했어요.`, 'success');
        else showToast('대진표를 공개했어요.', 'success');
        setPublishScheduleInput('');
      },
      onError: (err) => showToast(extractErrorMessage(err, '대진표 공개에 실패했어요.'), 'error'),
    });
  };

  const handlePublishBracket = async () => {
    if (publishBlockedReason) return;
    const warningLine = deadlinePassed ? '' : '접수 마감 전이에요. 그래도 공개할까요?\n\n';
    const ok = await confirmModal({
      title: '대진표 전체 공개',
      message: `${warningLine}공개하면 참가팀·방문자가 조/일정/대진표를 볼 수 있어요. 공개를 되돌릴 수는 있지만, 이미 본 참가자에게서 되돌릴 수는 없어요.`,
      confirmLabel: '전체 공개',
      tone: deadlinePassed ? 'default' : 'danger',
    });
    if (!ok) return;
    runPublish();
  };

  const handleSchedulePublish = async () => {
    if (publishBlockedReason || !publishScheduleInput) return;
    // datetime-local 은 타임존 표기가 없는 로컬 시각 문자열이라 Date 로 감싸 ISO(UTC)로 바꾼다.
    const scheduled = new Date(publishScheduleInput);
    if (Number.isNaN(scheduled.getTime())) {
      showToast('공개 예약 시각을 다시 확인해 주세요.', 'error');
      return;
    }
    if (scheduled.getTime() <= Date.now()) {
      showToast('공개 예약 시각은 현재 시각 이후여야 해요.', 'error');
      return;
    }
    const ok = await confirmModal({
      title: '대진표 공개 예약',
      message: `${formatDate(scheduled.toISOString())}에 대진표가 자동으로 공개돼요. 그 전까지는 계속 수정할 수 있어요.`,
      confirmLabel: '예약하기',
    });
    if (!ok) return;
    runPublish(scheduled.toISOString());
  };

  const handleUnpublishBracket = async () => {
    const ok = await confirmModal({
      title: isBracketPublished ? '대진표 공개 취소' : '공개 예약 취소',
      message: isBracketPublished
        ? '대진표를 다시 비공개로 되돌려요. 공개 페이지에는 "대진표 준비 중" 안내만 노출돼요. 이미 대진표를 본 참가자의 기억까지 되돌릴 수는 없어요.'
        : '예약된 공개를 취소해요. 대진표는 계속 비공개로 남아요.',
      confirmLabel: isBracketPublished ? '비공개로 되돌리기' : '예약 취소',
      tone: 'danger',
    });
    if (!ok) return;
    unpublishBracket.mutate(undefined, {
      onSuccess: (res) =>
        showToast(res.alreadyUnpublished ? '이미 비공개 상태예요.' : '대진표를 비공개로 되돌렸어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '공개 취소에 실패했어요.'), 'error'),
    });
  };

  return (
    <>
      {/* 확인 모달 — window.confirm 대체 */}
      {ConfirmModal}

      {/* ── 대진표 일괄 공개 ──────────────────────────────────────────── */}
      <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-5 py-4 mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-[var(--text-strong)] mb-1">대진표 전체 공개</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {isBracketPublished
                ? // 예약 시각이 지나 공개된 경우 bracketPublishedAt 은 null 이고 예약 시각이
                  // 공개 근거다. fallback 이 없으면 "—에 공개됨"으로 표시된다.
                  `${formatDate(bracketPublishedAt ?? bracketPublishScheduledAt ?? null)}에 공개됨 — 참가팀·방문자가 조/일정/대진표를 볼 수 있어요.`
                : hasPendingSchedule
                ? `${formatDate(bracketPublishScheduledAt ?? null)}에 자동 공개돼요. 그 전까지는 계속 수정할 수 있어요.`
                : '아직 비공개예요. 공개 전까지 공개 페이지에는 "대진표 준비 중" 안내만 노출돼요.'}
            </p>
            {!isBracketPublished && publishBlockedReason && (
              <p className="text-xs text-[var(--orange700)] mt-1">{publishBlockedReason}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && !isBracketPublished && (
              <button
                type="button"
                onClick={handlePublishBracket}
                disabled={publishBracket.isPending || !!publishBlockedReason}
                title={publishBlockedReason ?? undefined}
                className="inline-flex items-center h-[44px] px-4 rounded-xl text-[13px] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 whitespace-nowrap"
              >
                지금 전체 공개
              </button>
            )}
            {canWrite && (isBracketPublished || hasPendingSchedule) && (
              <button
                type="button"
                onClick={handleUnpublishBracket}
                disabled={unpublishBracket.isPending}
                className="inline-flex items-center h-[44px] px-4 rounded-xl text-[13px] font-semibold text-[var(--red700)] border border-[var(--tint-red-border)] bg-[var(--card-surface)] hover:bg-[var(--red50)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2 whitespace-nowrap"
              >
                {isBracketPublished ? '공개 취소' : '예약 취소'}
              </button>
            )}
          </div>
        </div>

        {/* 예약 공개 — 공개 전에만 노출한다(이미 공개된 대진표는 예약할 대상이 없다). */}
        {canWrite && !isBracketPublished && (
          <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-[var(--border)]">
            <div className="flex flex-col gap-1">
              <label htmlFor="bracket-publish-schedule" className="text-xs font-medium text-[var(--text-muted)]">
                공개 예약 시각
              </label>
              <input
                id="bracket-publish-schedule"
                type="datetime-local"
                value={publishScheduleInput}
                onChange={(e) => setPublishScheduleInput(e.target.value)}
                disabled={!!publishBlockedReason}
                className="h-[44px] px-3 rounded-xl border border-[var(--border)] text-[13px] text-[var(--text-strong)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              />
            </div>
            <button
              type="button"
              onClick={handleSchedulePublish}
              disabled={publishBracket.isPending || !publishScheduleInput || !!publishBlockedReason}
              title={publishBlockedReason ?? undefined}
              className="inline-flex items-center h-[44px] px-4 rounded-xl text-[13px] font-semibold text-[var(--blue700)] border border-[var(--tint-blue-border)] bg-[var(--card-surface)] hover:bg-[var(--blue50)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 whitespace-nowrap"
            >
              {hasPendingSchedule ? '예약 변경' : '이 시각에 공개 예약'}
            </button>
            <p className="text-xs text-[var(--text-muted)] basis-full">
              예약한 시각이 되면 스케줄러 없이 자동으로 공개돼요. 그 전까지는 조·경기를 계속 수정할 수 있어요.
            </p>
          </div>
        )}
      </div>

    <div className="flex flex-col gap-6">

      {/* ── 조 롤업 헤더 + 원클릭 조 추가 ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-1">
        <p className="text-[13px] font-semibold text-[var(--text-body)]">
          총 {groups.length}개 조 · {readyGroupCount}개 준비 완료
        </p>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculate.isPending}
            className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <RefreshCw size={13} aria-hidden="true" />
            순위 재계산
          </button>
        )}
      </div>

      <BracketGroupQuickAdd
        existingGroups={groups}
        createGroup={createGroup}
        showToast={showToast}
        onCreated={(id) => setFocusGroupId(id)}
      />

      {/* ── 조 카드 목록 (설계안 B) — 조 1개 = 카드 1개, 배정·순위·대진이 카드 안에서 끝난다 ── */}
      {groups.length === 0 ? (
        <AdminEmpty title="아직 만든 조가 없어요" description="위에서 원하는 유형을 눌러 조를 만들어 보세요." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <BracketGroupCard
              key={group.id}
              group={group}
              allGroups={groups}
              allStandings={allStandings}
              fixtures={fixtures}
              confirmedTeamItems={confirmedTeamItems}
              assignGroupTeam={assignGroupTeam}
              createFixture={createFixture}
              isAutoGenerating={isAutoGenerating}
              onAutoGenerate={(groupId) => void handleAutoGenerate(groupId)}
              onEditGroup={(g) => {
                setEditGroup(g);
                setEditGroupName(g.name);
                setEditGroupAdvance(g.advanceCount != null ? String(g.advanceCount) : '');
              }}
              onDeleteGroup={(g) => void handleDeleteGroup(g)}
              onRemoveGroupTeam={(groupTeamId, teamName) => void handleRemoveGroupTeam(groupTeamId, teamName)}
              autoFocus={focusGroupId === group.id}
              showToast={showToast}
            />
          ))}
        </div>
      )}

      {/* ── 픽스처 목록: 모든 조 합산 전체보기 (조 카드와 별개, 전폭 섹션) ── */}
      {fixtures.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-bold text-[var(--text-strong)]">경기 일정 전체보기</h3>
          {/* #6b: scrollOnMobile so wide fixture rows scroll horizontally on narrow screens.
              tableMaxWidth="max-w-none" — 조 카드 목록과 별개인 전폭 섹션이라
              기본 900px 캡을 걸 이유가 없고, 오히려 좁은 데스크톱(~1024px)에서
              불필요한 가로 스크롤을 유발했다. */}
          <AdminDataTable<V1AdminBracketFixture>
            scrollOnMobile
            tableMaxWidth="max-w-none"
            columns={[
              {
                key: 'round',
                header: '라운드',
                render: (f) => <span className="text-[var(--text-muted)]">{f.round}</span>,
              },
              {
                key: 'fixtureNumber',
                header: '번호',
                width: 'w-[80px]',
                align: 'center',
                render: (f) => <span className="tabular-nums text-[var(--text-muted)]">{f.fixtureNumber}</span>,
              },
              {
                key: 'homeTeamName',
                header: '홈',
                render: (f) => (
                  <span className="font-medium text-[var(--text-strong)] break-keep">{f.homeTeamName ?? '—'}</span>
                ),
              },
              {
                key: 'awayTeamName',
                header: '어웨이',
                render: (f) => (
                  <span className="font-medium text-[var(--text-strong)] break-keep">{f.awayTeamName ?? '—'}</span>
                ),
              },
              {
                key: 'result',
                header: '결과',
                width: 'w-[140px]',
                render: (f) => (
                  <span className="tabular-nums text-[var(--text-muted)]">
                    {f.result
                      ? `${f.result.homeScore} : ${f.result.awayScore}${f.result.hasPenalty ? ` (PK ${f.result.homePenaltyScore}:${f.result.awayPenaltyScore})` : ''}`
                      : '—'}
                  </span>
                ),
              },
            ]}
            rows={fixtures}
            keyExtractor={(f) => f.id}
            renderActions={(f) => {
              // 결과 기록·정정은 이제 Game result-revision 플로우로만 이뤄진다 — 레거시
              // POST/DELETE .../result 는 서버에서 409 TOURNAMENT_RESULT_DERIVED_ONLY로
              // 항상 막혀 있다(tournament-bracket.service.ts). 이 행은 그 콘솔로 안내한다:
              // 이미 결과가 있으면(레거시 읽기 전용 표시, '결과' 컬럼 참고) 정정 화면으로,
              // 아직 없으면 검토 화면으로 — T6-1(2026-08-07)부터 두 화면 다 `?fixtureId=`
              // 딥링크를 받아 그 경기를 바로 선택된 상태로 연다.
              // `from=admin`은 더 이상 붙이지 않는다: 어드민 표면(`/admin/live/…`)은 경로만
              // 보고 복귀 지점을 알 수 있고, 그 파라미터는 세션에 출처를 박제해 같은 대회를
              // 스태프 표면에서 여는 사람에게까지 '대회 관리로 돌아가기'를 남긴다.
              const opsQuery = `fixtureId=${encodeURIComponent(f.id)}`;
              const resultConsoleHref = f.result
                ? `/admin/live/${encodeURIComponent(tournamentId)}/records/corrections?${opsQuery}`
                : `/admin/live/${encodeURIComponent(tournamentId)}/result-review?${opsQuery}`;
              const resultConsoleLabel = f.result ? '결과 정정하러 가기' : '결과 검토하러 가기';
              // T6-4: 아직 뛰고 있거나 곧 시작할 경기는 결과 검토보다 라이브 운영 콘솔이
              // 우선이다 — 같은 자리에 "운영 콘솔 열기"를 추가로 노출한다.
              const canOperate = f.status === 'scheduled' || f.status === 'in_progress';
              const operateHref = `/admin/live/${encodeURIComponent(tournamentId)}/fixtures/${encodeURIComponent(f.id)}/operate`;
              return (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditFixture(f);
                      setEditFxScheduledAt(isoToDatetimeLocalValue(f.scheduledAt));
                      setEditFxVenue(f.venue ?? '');
                      setEditFxHomeRegId(f.homeRegistrationId ?? '');
                      setEditFxAwayRegId(f.awayRegistrationId ?? '');
                    }}
                    aria-label={`${f.round} ${f.fixtureNumber}번 경기 수정`}
                    className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium whitespace-nowrap text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    <Pencil size={12} aria-hidden="true" /> 수정
                  </button>
                  {canOperate && (
                    <Link
                      href={operateHref}
                      aria-label={`${f.round} ${f.fixtureNumber}번 경기 운영 콘솔 열기`}
                      className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium whitespace-nowrap text-[var(--green700)] bg-[var(--green50)] hover:bg-[var(--green100)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      운영 콘솔 열기
                      <ChevronRight size={12} aria-hidden="true" />
                    </Link>
                  )}
                  {/* 결과 입력·수정·삭제 세 버튼이 하나로 합쳐진 자리라, 폭을 좁은 아이콘
                      버튼이 아니라 라벨이 있는 CTA로 채워 행의 시각적 무게를 유지한다.
                      aria-label은 시각 텍스트와 동일한 문구를 담는다(WCAG 2.5.3 Label in
                      Name) — 예전엔 "…콘솔로 이동"으로 시각 텍스트와 달라 스크린리더
                      사용자가 음성 명령("결과 검토하러 가기 클릭")으로 못 찾는 문제가 있었다. */}
                  <Link
                    href={resultConsoleHref}
                    aria-label={`${f.round} ${f.fixtureNumber}번 경기 ${resultConsoleLabel}`}
                    className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium whitespace-nowrap text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    {resultConsoleLabel}
                    <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                  {/* 경기 기록·운영 감사 기록이 붙은 대진은 스키마상 지울 수 없다. 여기서는
                      그 사실을 미리 알 수 없으므로(대진 목록 응답에 게임 유무가 없다) 버튼은
                      그대로 두고, 서버가 409 FIXTURE_NOT_DELETABLE 로 **무엇이 막는지** 알려
                      주면 그 문구를 아래 onError 가 토스트로 그대로 보여 준다. 예전에는 같은
                      클릭이 매핑 없는 500("서버 오류")으로 끝났다. */}
                  {!f.result && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteFixture(f)}
                      aria-label={`${f.round} ${f.fixtureNumber}번 경기 삭제`}
                      className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--red50)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  )}
                </span>
              );
            }}
          />
        </div>
      )}

      {/* ── Fixture edit modal ────────────────────────────────────────── */}
      <SimpleModal
        open={editFixture !== null}
        title="경기 수정"
        onClose={() => setEditFixture(null)}
        pending={updateFixture.isPending}
      >
        <form onSubmit={handleUpdateFixture} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-fx-scheduled" className="text-[13px] text-[var(--text-strong)]">경기 일시</label>
            <input
              id="edit-fx-scheduled"
              type="datetime-local"
              value={editFxScheduledAt}
              onChange={(e) => setEditFxScheduledAt(e.target.value)}
              disabled={updateFixture.isPending}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-fx-venue" className="text-[13px] text-[var(--text-strong)]">장소</label>
            <input
              id="edit-fx-venue"
              type="text"
              value={editFxVenue}
              onChange={(e) => setEditFxVenue(e.target.value)}
              disabled={updateFixture.isPending}
              maxLength={200}
              placeholder="예: 성산 풋살파크 A구장"
              className={inputCls}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="edit-fx-home" className="text-[13px] text-[var(--text-strong)]">홈 팀</label>
              <EntityPicker
                id="edit-fx-home"
                value={editFixtureTeamItems.find((it) => it.id === editFxHomeRegId) ?? null}
                onChange={(item) => setEditFxHomeRegId(item?.id ?? '')}
                items={editFixtureTeamItems}
                disabled={updateFixture.isPending || !!editFixture?.result}
                clearLabel="미정"
                placeholder="홈 팀 검색"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="edit-fx-away" className="text-[13px] text-[var(--text-strong)]">어웨이 팀</label>
              <EntityPicker
                id="edit-fx-away"
                value={editFixtureTeamItems.find((it) => it.id === editFxAwayRegId) ?? null}
                onChange={(item) => setEditFxAwayRegId(item?.id ?? '')}
                items={editFixtureTeamItems}
                disabled={updateFixture.isPending || !!editFixture?.result}
                clearLabel="미정"
                placeholder="어웨이 팀 검색"
              />
            </div>
          </div>
          {editFixture?.result && (
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] m-0">결과가 기록된 경기는 팀을 바꿀 수 없어요. 팀을 바꾸려면 결과를 먼저 삭제해 주세요.</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditFixture(null)}
              disabled={updateFixture.isPending}
              className="flex-1 h-[44px] rounded-xl text-[13px] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button type="submit" disabled={updateFixture.isPending} className={'flex-1 ' + submitBtnCls}>
              {updateFixture.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>

      {/* ── Group edit modal ──────────────────────────────────────────── */}
      <SimpleModal
        open={editGroup !== null}
        title="조 수정"
        onClose={() => setEditGroup(null)}
        pending={updateGroup.isPending}
      >
        <form onSubmit={handleUpdateGroup} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-group-name" className="text-[13px] text-[var(--text-strong)]">조 이름</label>
            <input
              id="edit-group-name"
              type="text"
              value={editGroupName}
              onChange={(e) => setEditGroupName(e.target.value)}
              disabled={updateGroup.isPending}
              maxLength={60}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-group-advance" className="text-[13px] text-[var(--text-strong)]">진출 팀 수 (선택)</label>
            <input
              id="edit-group-advance"
              type="text"
              inputMode="numeric"
              value={editGroupAdvance}
              onChange={(e) => setEditGroupAdvance(onlyDigits(e.target.value))}
              disabled={updateGroup.isPending}
              placeholder="예: 2"
              className={inputCls}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditGroup(null)}
              disabled={updateGroup.isPending}
              className="flex-1 h-[44px] rounded-xl text-[13px] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button type="submit" disabled={updateGroup.isPending || !editGroupName.trim()} className={'flex-1 ' + submitBtnCls}>
              {updateGroup.isPending ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </SimpleModal>

      {/* ── 조별리그 대진 자동 생성 — 회전 수 선택 모달 ───────── */}
      <SimpleModal
        open={legsPickerGroupId !== null}
        title="조별리그 대진 자동 생성"
        onClose={() => setLegsPickerGroupId(null)}
        pending={isGeneratingLeague}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="league-fixtures-legs" className="text-[13px] text-[var(--text-strong)]">회전 수</label>
            <select
              id="league-fixtures-legs"
              value={legsPickerValue}
              onChange={(e) => setLegsPickerValue(e.target.value as '1' | '2')}
              disabled={isGeneratingLeague}
              className={inputCls}
            >
              <option value="1">1회전 (싱글 라운드로빈)</option>
              <option value="2">2회전 (홈/어웨이 더블 라운드로빈)</option>
            </select>
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              모든 팀이 서로 {legsPickerValue}회씩 맞붙는 대진을 자동으로 만들어요.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setLegsPickerGroupId(null)}
              disabled={isGeneratingLeague}
              className="flex-1 h-[44px] rounded-xl text-[13px] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateLeagueFixtures(false)}
              disabled={isGeneratingLeague}
              className={'flex-1 ' + submitBtnCls}
            >
              {isGeneratingLeague ? '생성 중…' : '자동 생성'}
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
    </>
  );
}
