'use client';

import { useV1DataSource } from '@/components/providers/v1-data-source';

import { useId, useState } from 'react';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { Check, RefreshCw, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { FixtureTimePicker } from '@/components/admin/bracket-canvas/fixture-time-picker';
import { onlyDigits } from '@/lib/number-format';
import { useV1AdminBracket, useV1CreateGroup, useV1AssignGroupTeam, useV1CreateBracketBye, useV1CreateFixture, useV1RecalculateStandings, useV1UpdateFixture, useV1DeleteFixture, useV1UpdateGroup, useV1DeleteGroup, useV1RemoveGroupTeam } from '@/hooks/use-v1-api';
import type {
  V1AdminTournamentRegistration,
  V1AdminBracketGroup,
  V1AdminBracketFixture,
  V1GenerateLeagueFixturesResponse,
} from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError, v1Post, v1Patch } from '@/lib/api-client';
// 조별리그 라운드로빈은 서버(POST /admin/tournaments/:id/league/fixtures/generate)로 이관했다.
// 여기 남는 knockoutSeedPairs 는 녹아웃 시드 페어링 전용이다.
import { knockoutSeedPairs, round12Pairs } from '@/lib/tournament-bracket-gen';
import { bracketSourceCandidates, bracketSourceSideOptions } from '@/lib/bracket-fixture-tools';
import { BRACKET_SOURCE_PHASES } from '@/lib/tournament-bracket-rounds';
import { competitionMatchLabel, tournamentRoundLabel } from '@/lib/tournament-round-label';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useStartedTeamChangeReason } from '@/components/admin/bracket-canvas/use-started-team-change-reason';
import { useV1AssignTournamentSlot } from '@/hooks/use-v1-bracket-canvas';
import { fixtureTeamChangeAccess } from '@/lib/bracket-canvas-layout';
import { registrationIdsBlockedForGroup, registrationIdsInOppositeFinalStage } from '@/lib/bracket-group-enrollment';
import { BracketGroupQuickAdd } from './bracket-group-quick-add';
import { BracketGroupCard } from './bracket-group-card';
import { isGroupReady } from './bracket-group-helpers';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { CompetitionFieldPicker } from '@/components/admin/competition-field-picker';
import { FixtureLabelFields, fixtureLabelDraft, fixtureLabelPatch, type LabelDraft } from '@/components/admin/bracket-canvas/fixture-metadata-editor';
import { PlacePicker } from '@/components/v1-ui/place-picker';
import { PLACE_NAME_MAX_LENGTH } from '@/lib/place';
import type { PlaceValue } from '@/lib/place';
import { placedRegistrationIdsForSlot } from '@/lib/bracket-slot-candidates';
import { buildSideLabelContext, fixtureSideLabel } from '@/lib/bracket-canvas-layout';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { fixtureVenuePatch, fixtureVenueValue } from '@/components/admin/bracket-canvas/fixture-venue-patch';
import {
  SimpleModal,
  inputCls,
  submitBtnCls,
} from './tournament-detail-shared';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import { Button } from '@/components/v1-ui/button';
import { BracketListSlotTools } from '@/components/admin/bracket-canvas/bracket-list-slot-tools';
import { CrossGroupRound12Dialog } from '@/components/admin/bracket-canvas/cross-group-round12-dialog';
import { PeriodOverrideField, useGroupPeriodOverride, useMatchPeriodOverride } from '@/components/admin/period-override-field';


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

/** "경기 일정 전체보기" 는 모든 조를 한 표에 섞는다 — 조 이름까지 붙인 경기 이름으로 행을 가린다. */
function bracketFixtureLabel(f: V1AdminBracketFixture, groups: readonly V1AdminBracketGroup[]): string {
  if (f.displayTitle?.trim()) return f.displayTitle;
  const groupName = groups.find((group) => group.id === f.groupId)?.name ?? null;
  return `${competitionMatchLabel({ groupName, round: f.round, legNumber: f.legNumber })} ${f.fixtureNumber}번 경기`;
}

export function BracketTab({
  tournamentId,
  showToast,
  registrations,
  canWrite,
  tournamentFormat,
  unscheduledOnly,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
  registrations: V1AdminTournamentRegistration[];
  canWrite: boolean;
  tournamentFormat?: 'knockout' | 'league' | 'group_knockout' | 'league_knockouts';
  /** 도구 줄의 「시간 미정 경기만 보기」 — 경기 일정 전체보기 표에서 시간이 있는 경기를 뺀다. */
  unscheduledOnly: boolean;
}) {
  const { v1Post, v1Patch } = useV1DataSource();
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const [round12AutoOpen, setRound12AutoOpen] = useState(false);
  const createGroup = useV1CreateGroup(tournamentId);
  const assignGroupTeam = useV1AssignGroupTeam(tournamentId);
  const createFixture = useV1CreateFixture(tournamentId);
  const createBye = useV1CreateBracketBye(tournamentId);
  const recalculate = useV1RecalculateStandings(tournamentId);
  const updateFixture = useV1UpdateFixture(tournamentId);
  const deleteFixture = useV1DeleteFixture(tournamentId);
  const updateGroup = useV1UpdateGroup(tournamentId);
  const deleteGroup = useV1DeleteGroup(tournamentId);
  const removeGroupTeam = useV1RemoveGroupTeam(tournamentId);
  const assignTournamentSlot = useV1AssignTournamentSlot(tournamentId, 'tournament');

  // ── 경기 수정 모달 상태 ─────────────────────────────────────────────
  const [sourceFixture, setSourceFixture] = useState<V1AdminBracketFixture | null>(null);
  const [homeSource, setHomeSource] = useState('');
  const [awaySource, setAwaySource] = useState('');
  const [savingSources, setSavingSources] = useState(false);
  const [editFixture, setEditFixture] = useState<V1AdminBracketFixture | null>(null);
  const editNumberId = useId();
  const [editFxNumber, setEditFxNumber] = useState('');
  const [editFxLabels, setEditFxLabels] = useState<LabelDraft>({ displayTitle: '', homeDisplayLabel: '', awayDisplayLabel: '' });
  const [editFxFieldId, setEditFxFieldId] = useState('');
  const [editFxError, setEditFxError] = useState<string | null>(null);
  const [editFxScheduledAt, setEditFxScheduledAt] = useState('');
  const [editFxVenue, setEditFxVenue] = useState<PlaceValue | null>(null);
  const [editFxHomeRegId, setEditFxHomeRegId] = useState('');
  const [editFxAwayRegId, setEditFxAwayRegId] = useState('');
  const [savingFixtureEdit, setSavingFixtureEdit] = useState(false);

  // ── 조 수정 모달 상태 ───────────────────────────────────────────────
  const [editGroup, setEditGroup] = useState<V1AdminBracketGroup | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupAdvance, setEditGroupAdvance] = useState('');
  // 경기 방식은 이 경기·조에만 저장한다 — 단계·대회 기본 설정은 대회 정보에서만 바뀐다.
  const fixturePeriods = useMatchPeriodOverride(tournamentId, editFixture?.id ?? null, '대회 기본값');
  const groupPeriods = useGroupPeriodOverride(tournamentId, editGroup?.phase === 'group' ? editGroup.id : null);

  // 조 카드 트리 — 그룹 생성 폼·팀 배정 폼·픽스처 생성 폼은 각 조 카드(bracket-group-card.tsx)
  // 안으로 이동했다(설계안 B). 여기 남는 건 "방금 만든 조로 스크롤" 신호뿐.
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const { confirm: confirmModal, ConfirmModal } = useConfirm();
  const { requestReason, dialog: teamChangeDialog } = useStartedTeamChangeReason();

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
  const editBlockedIds = new Set([
    ...registrationIdsBlockedForGroup(bracket?.groups ?? [], editFixture?.groupId ?? null),
    ...registrationIdsInOppositeFinalStage(bracket?.groups ?? [], bracket?.fixtures ?? [], editFixture?.groupId ?? null),
  ]);
  const editPickerItems = (selectedId: string, otherSideSelectedId: string, sideSlotId: string | null) => {
    const slots = bracket?.slots ?? [];
    const target = slots.find(slot => slot.id === sideSlotId);
    const placed = placedRegistrationIdsForSlot(slots, target, bracket?.groups ?? []);
    return editFixtureTeamItems.filter(item => item.id === selectedId || (
      item.id !== otherSideSelectedId && !editBlockedIds.has(item.id) && (sideSlotId === null || !placed.has(item.id))
    ));
  };

  const editFixtureAccess = editFixture ? fixtureTeamChangeAccess(editFixture) : 'free';
  const editFixtureTeamsLocked = editFixtureAccess === 'official' || editFixtureAccess === 'cancelled' || tournamentFormat === 'league_knockouts';
  const slotSideLocked = (side: 'HOME' | 'AWAY') => editFixtureAccess === 'started' && editFixture !== null && (side === 'HOME' ? editFixture.homeSlotId : editFixture.awaySlotId) !== null;

  function openFixtureEditor(fixture: V1AdminBracketFixture) {
    setEditFixture(fixture);
    setEditFxNumber(String(fixture.fixtureNumber));
    setEditFxScheduledAt(isoToKstDatetimeLocal(fixture.scheduledAt));
    setEditFxVenue(fixtureVenueValue(fixture));
    setEditFxLabels(fixtureLabelDraft(fixture));
    setEditFxFieldId(fixture.fieldId ?? '');
    setEditFxError(null);
    setEditFxHomeRegId(fixture.homeRegistrationId ?? '');
    setEditFxAwayRegId(fixture.awayRegistrationId ?? '');
  }

  async function handleFixtureCreated(fixtureId: string) {
    try {
      // 생성 응답은 요약이다. 실제 game·slot·팀 정보를 가진 조회 응답으로만 수정창을 연다.
      const refreshed = await refetch();
      if (refreshed.isError) throw refreshed.error;
      const fixture = refreshed.data?.fixtures.find((row) => row.id === fixtureId);
      if (!fixture) throw new Error('생성한 경기를 최신 대진에서 찾지 못했어요.');
      openFixtureEditor(fixture);
    } catch (error) {
      showToast(`경기는 생성됐지만 수정 정보를 불러오지 못했어요. ${extractErrorMessage(error, '목록을 다시 불러온 뒤 수정해 주세요.')}`, 'error');
    }
  }

  const handleUpdateFixture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFixture) return;
    const fixtureNumber = Number(editFxNumber);
    if (!editFxNumber.trim() || !Number.isInteger(fixtureNumber) || fixtureNumber < 1 || fixtureNumber > 2147483647) {
      showToast('대진 번호는 1부터 2147483647까지의 정수로 입력해 주세요.', 'error');
      return;
    }
    // 팀 필드는 각각 독립적으로 판단한다 — 홈만 바꾸고 원정은 그대로여도 원정 필드를
    // 잘못 건드리지 않기 위해서다. '미정'으로 되돌린 경우(editFx*RegId === '')는 서버 계약대로
    // null을 명시적으로 보내 배정을 해제한다 — 필드를 아예 빼면(undefined) 서버가 '미변경'으로
    // 읽어 기존 배정이 그대로 남는다(과거 버그).
    const homeChanged = editFxHomeRegId !== (editFixture.homeRegistrationId ?? '');
    const awayChanged = editFxAwayRegId !== (editFixture.awayRegistrationId ?? '');
    if (editFxHomeRegId && editFxHomeRegId === editFxAwayRegId && (homeChanged || awayChanged)) {
      showToast('홈 팀과 원정 팀은 서로 다른 팀을 선택해 주세요.', 'error');
      return;
    }
    // datetime-local 입력값은 오프셋이 없는 KST 벽시계 문자열이다(isoToKstDatetimeLocal 이
    // Asia/Seoul로 채워 넣는다) — new Date(value).toISOString()로 바로 변환하면 브라우저
    // 로컬 타임존으로 잘못 해석된다. 대칭 함수 kstDatetimeLocalToIso 로 KST 오프셋을 고정해야
    // 값을 안 건드리고 저장만 눌러도 킥오프가 밀리지 않는다.
    setEditFxError(null);
    if (fixturePeriods.payload && fixturePeriods.error) { setEditFxError(fixturePeriods.error); return; }
    const scheduledAtIso = editFxScheduledAt ? kstDatetimeLocalToIso(editFxScheduledAt) : null;
    if (editFxScheduledAt && scheduledAtIso === null) { setEditFxError('경기 시각을 다시 확인해 주세요.'); return; }
    const labelsPatch = fixtureLabelPatch(editFxLabels, editFixture);
    const placePatch = editFxFieldId ? (editFxFieldId === editFixture.fieldId ? {} : { fieldId: editFxFieldId })
      : { ...(editFixture.fieldId ? { fieldId: null } : {}), ...fixtureVenuePatch(editFxVenue, editFixture) };
    // 시작된 경기의 팀 교체는 옛 팀 명단·기록이 지워지므로 확인과 사유를 먼저 받는다.
    const changedSides = [homeChanged ? editFixture.homeTeamName : null, awayChanged ? editFixture.awayTeamName : null].filter((side): side is string => side !== null);
    const teamChangeReason = changedSides.length > 0 && editFixtureAccess === 'started' ? await requestReason(changedSides) : undefined;
    if (teamChangeReason === null) return;
    const sourceSides = new Set((editFixture.bracketSources ?? []).map((source) => source.side));
    if ((homeChanged && sourceSides.has('HOME')) || (awayChanged && sourceSides.has('AWAY'))) {
      showToast('이전 경기 결과로 이어지는 자리는 직접 바꿀 수 없어요. 진출 연결을 수정해 주세요.', 'error');
      return;
    }
    const slotAssignments = (['HOME', 'AWAY'] as const).flatMap((side) => {
      const changed = side === 'HOME' ? homeChanged : awayChanged;
      const slotId = side === 'HOME' ? editFixture.homeSlotId : editFixture.awaySlotId;
      const registrationId = side === 'HOME' ? editFxHomeRegId : editFxAwayRegId;
      return changed && slotId !== null ? [{ side, slotId, registrationId: registrationId || null }] : [];
    });
    const directHomeChanged = homeChanged && editFixture.homeSlotId === null && !sourceSides.has('HOME');
    const directAwayChanged = awayChanged && editFixture.awaySlotId === null && !sourceSides.has('AWAY');
    const metadataChanged = fixtureNumber !== editFixture.fixtureNumber || editFxScheduledAt !== isoToKstDatetimeLocal(editFixture.scheduledAt) || Object.keys(placePatch).length > 0 || Object.keys(labelsPatch).length > 0;
    setSavingFixtureEdit(true);
    const assignedSides: string[] = [];
    try {
      for (const assignment of slotAssignments) {
        await assignTournamentSlot.mutateAsync({ slotId: assignment.slotId, registrationId: assignment.registrationId });
        assignedSides.push(assignment.side === 'HOME' ? '홈' : '원정');
      }
      const complete = async (result: Awaited<ReturnType<typeof updateFixture.mutateAsync>> | null) => {
        // 경기 방식이 그대로면 기다리지 않고 바로 닫는다(async 함수는 첫 await 전까지 동기로 돈다).
        if (fixturePeriods.payload) {
          try {
            await fixturePeriods.save();
          } catch (err) {
            // 경기 정보는 이미 저장됐다 — 창을 닫지 않고 경기 방식만 다시 저장하게 한다.
            const errorMessage = `경기 정보는 저장됐어요. 경기 방식은 저장하지 못했어요: ${extractErrorMessage(err, '다시 시도해 주세요.')}`;
            setEditFxError(errorMessage);
            showToast(errorMessage, 'error');
            setSavingFixtureEdit(false);
            return;
          }
        }
        setEditFixture(null);
        showToast(
          result?.startedTeamChange == null
            ? '경기 정보를 수정했어요.'
            : `팀을 바꿨어요. 옛 팀 기록 ${result.startedTeamChange.removedEventCount}건을 지웠어요.`,
          'success',
        );
        setSavingFixtureEdit(false);
      };
      const reportFailure = (err: unknown) => {
        void refetch().finally(() => {
          const errorMessage = extractErrorMessage(err, '경기 수정에 실패했어요.');
          setEditFxError(assignedSides.length ? `${assignedSides.join('·')} 자리 배정은 저장됐어요. 나머지 수정은 실패했어요: ${errorMessage}` : errorMessage);
          showToast(
            assignedSides.length > 0
              ? `${assignedSides.join('·')} 자리 배정은 저장됐어요. 나머지 수정은 실패했어요: ${errorMessage}`
              : errorMessage,
            'error',
          );
          setSavingFixtureEdit(false);
        });
      };
      if (metadataChanged || directHomeChanged || directAwayChanged || slotAssignments.length === 0) {
        updateFixture.mutate(
          {
            fixtureId: editFixture.id,
            ...(teamChangeReason === undefined ? {} : { teamChangeReason }),
            ...(fixtureNumber !== editFixture.fixtureNumber ? { fixtureNumber } : {}),
            ...(scheduledAtIso !== editFixture.scheduledAt ? { scheduledAt: scheduledAtIso } : {}),
            ...placePatch,
            ...labelsPatch,
            ...(directHomeChanged ? { homeRegistrationId: editFxHomeRegId || null } : {}),
            ...(directAwayChanged ? { awayRegistrationId: editFxAwayRegId || null } : {}),
          },
          { onSuccess: (result) => void complete(result), onError: reportFailure },
        );
      } else {
        await complete(null);
      }
    } catch (err) {
      setSavingFixtureEdit(false);
      await refetch();
      const errorMessage = extractErrorMessage(err, '경기 수정에 실패했어요.');
          setEditFxError(assignedSides.length ? `${assignedSides.join('·')} 자리 배정은 저장됐어요. 나머지 수정은 실패했어요: ${errorMessage}` : errorMessage);
      showToast(
        assignedSides.length > 0
          ? `${assignedSides.join('·')} 자리 배정은 저장됐어요. 나머지 수정은 실패했어요: ${errorMessage}`
          : errorMessage,
        'error',
      );
    }
  };

  const handleDeleteFixture = async (f: V1AdminBracketFixture) => {
    const downstreamCount = bracket?.fixtures.filter((fixture) => fixture.bracketSources?.some((source) => source.fixtureId === f.id)).length ?? 0;
    const downstreamImpact = downstreamCount > 0 ? ` 이 경기를 진출 출처로 쓰는 후속 경기 ${downstreamCount}개도 영향을 받아요.` : '';
    const ok = await confirmModal({
      title: '경기 삭제',
      message: `${bracketFixtureLabel(f, bracket?.groups ?? [])}를 삭제할까요? 되돌릴 수 없어요.${downstreamImpact}`,
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
    if (groupPeriods.payload && groupPeriods.error) { showToast(groupPeriods.error, 'error'); return; }
    const parsed = Number.parseInt(editGroupAdvance, 10);
    updateGroup.mutate(
      {
        groupId: editGroup.id,
        name: editGroupName.trim(),
        ...(tournamentFormat !== 'league_knockouts' && Number.isInteger(parsed) && parsed > 0 ? { advanceCount: parsed } : {}),
      },
      {
        onSuccess: async () => {
          if (groupPeriods.payload) {
            try {
              await groupPeriods.save();
            } catch (err) {
              showToast(`조 정보는 저장됐어요. 경기 방식은 저장하지 못했어요: ${extractErrorMessage(err, '다시 시도해 주세요.')}`, 'error');
              return;
            }
          }
          setEditGroup(null);
          showToast('조 정보를 수정했어요.', 'success');
        },
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
    const isBye = bracket?.groups.some((group) => group.groupTeams.some((team) => team.id === groupTeamId && team.isBye)) ?? false;
    const ok = await confirmModal({
      title: isBye ? '부전승 자리 삭제' : '팀 배정 해제',
      message: isBye ? `${teamName} 부전승 자리를 삭제할까요? 팀만 미정으로 바꾸려면 자리 수정을 이용해 주세요.` : `${teamName} 팀의 조 배정을 해제할까요? 해당 조 순위 기록도 함께 정리돼요.`,
      confirmLabel: isBye ? '삭제' : '해제',
      tone: 'danger',
    });
    if (!ok) return;
    removeGroupTeam.mutate(groupTeamId, {
      onSuccess: () => showToast(isBye ? '부전승 자리를 삭제했어요.' : '팀 배정을 해제했어요.', 'success'),
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

    const isKnockout = group.phase !== 'group';

    if (!isKnockout) {
      // GROUP phase — 조별리그 대진은 서버가 만든다. 회전 수(1회전/2회전)를 모달에서 고른 뒤
      // POST /admin/tournaments/:id/league/fixtures/generate 를 호출한다.
      // 기존 fixture 존재 여부·최소 경기 수 검증도 서버가 판정하므로 여기서 미리 묻지 않는다.
      if (group.groupTeams.filter((team) => team.registrationId).length < 2) {
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
    if (existingInGroup.length > 0 && ['round16', 'round12', 'quarter'].includes(group.phase)) {
      showToast('이미 경기 일정이 있어요. 기존 대진을 수정하거나 빠진 경기를 직접 추가해 주세요.', 'error');
      return;
    }
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
        const teams = group.groupTeams.filter((team): team is typeof team & { registrationId: string } => !team.isBye && team.registrationId !== null);
        if (group.phase === 'round12' && (group.groupTeams.length !== 12 || teams.length !== 8)) {
          showToast('12팀을 배정하고 부전승 4팀을 지정해 주세요. 나머지 8팀의 4경기를 만들어요.', 'error');
          return;
        }
        const roundLabel = tournamentRoundLabel(group.phase);

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
        for (const { home, away } of (group.phase === 'round12' ? round12Pairs(group.groupTeams.filter((team): team is typeof team & { registrationId: string } => team.registrationId !== null)) : knockoutSeedPairs(sorted))) {
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
  const sideLabelContext = buildSideLabelContext(groups, fixtures, bracket?.slots ?? []);
  const scheduleRows = unscheduledOnly ? fixtures.filter((fixture) => fixture.scheduledAt === null) : fixtures;
  const allStandings = bracket?.standings ?? [];
  const readyGroupCount = groups.filter((g) => isGroupReady(g, fixtures, bracket?.slots ?? [])).length;
  const qualifyingGroupCount = groups.filter((group) => group.phase === 'group').length;
  const knockoutStageCount = groups.length - qualifyingGroupCount;

  return (
    <>
      {ConfirmModal}
      {teamChangeDialog}

    <div className="flex flex-col gap-6">

      {canWrite && tournamentFormat && tournamentFormat !== 'league_knockouts' ? <BracketListSlotTools tournamentId={tournamentId}
        groups={groups} slots={bracket?.slots ?? []} registrations={registrations} canWrite={canWrite} showToast={showToast} /> : null}
      {round12AutoOpen ? <CrossGroupRound12Dialog tournamentId={tournamentId} onClose={() => setRound12AutoOpen(false)} showToast={showToast} /> : null}

      {/* ── 조 롤업 헤더 + 원클릭 조 추가 ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-1">
        <p className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
          총 {qualifyingGroupCount > 0 || knockoutStageCount === 0 ? `${qualifyingGroupCount}개 조` : ''}{qualifyingGroupCount > 0 && knockoutStageCount > 0 ? ' · ' : ''}{knockoutStageCount > 0 ? `${knockoutStageCount}개 결선 단계` : ''} · {readyGroupCount}개 준비 완료
        </p>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculate.isPending}
            className="tm-on-tint inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <RefreshCw size={13} aria-hidden="true" />
            순위 재계산
          </button>
        )}
      </div>

      {tournamentFormat !== 'league_knockouts' && canWrite ? <BracketGroupQuickAdd
        existingGroups={groups}
        createGroup={createGroup}
        showToast={showToast}
        onCreated={(id) => setFocusGroupId(id)}
      /> : null}

      {/* ── 조 카드 목록 (설계안 B) — 조 1개 = 카드 1개, 배정·순위·대진이 카드 안에서 끝난다 ── */}
      {groups.length === 0 ? (
        <AdminEmpty title="아직 만든 조가 없어요" description={tournamentFormat === 'league_knockouts' ? '예선·토너먼트 대진 생성에서 예선 조를 편성해 주세요.' : '위에서 원하는 유형을 눌러 조를 만들어 보세요.'} />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              {canWrite && tournamentFormat === 'group_knockout' && group.phase === 'round12' && groups.filter((item) => item.phase === 'group').length === 5
                ? <div className="flex justify-end"><Button variant="outline" size="md" onClick={() => setRound12AutoOpen(true)}>12강 진출팀 자동 배정</Button></div> : null}
              <BracketGroupCard
                tournamentId={tournamentId}
                structureEditable={canWrite && tournamentFormat !== 'league_knockouts'}
                nameEditable={canWrite}
                slots={bracket?.slots ?? []}
                group={group}
                managedEntrySlots={(bracket?.slots ?? []).some((slot) => slot.kind === 'ENTRY' && slot.groupId === group.id)}
                allGroups={groups}
                allStandings={allStandings}
                fixtures={fixtures}
                confirmedTeamItems={confirmedTeamItems}
                assignGroupTeam={assignGroupTeam}
                createFixture={createFixture}
                createBye={createBye}
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
                onFixtureCreated={(fixtureId) => void handleFixtureCreated(fixtureId)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── 픽스처 목록: 모든 조 합산 전체보기 (조 카드와 별개, 전폭 섹션) ── */}
      {fixtures.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">경기 일정 전체보기</h3>
          {unscheduledOnly ? (
            <p className="tm-text-caption text-[var(--text-muted)]">
              {scheduleRows.length === 0 ? '시간 미정 경기가 없어요.' : `시간 미정 ${scheduleRows.length}경기만 보고 있어요.`}
            </p>
          ) : null}
          {/* 모바일에서는 경기별 카드로 모든 열과 작업을 볼 수 있다.
              tableMaxWidth="max-w-none" — 조 카드 목록과 별개인 전폭 섹션이라
              기본 900px 캡을 걸 이유가 없고, 오히려 좁은 데스크톱(~1024px)에서
              불필요한 가로 스크롤을 유발했다. */}
          <AdminDataTable<V1AdminBracketFixture>
            tableMaxWidth="max-w-none"
            columns={[
              {
                key: 'round',
                header: '경기 제목',
                render: (f) => (
                  <span className="text-[var(--text-muted)] break-words">
                    {f.displayTitle || competitionMatchLabel({
                      groupName: groups.find((group) => group.id === f.groupId)?.name ?? null,
                      round: f.round,
                      legNumber: f.legNumber,
                    })}
                  </span>
                ),
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
                  <span className="font-medium text-[var(--text-strong)] break-keep break-words">{fixtureSideLabel(f, 'HOME', sideLabelContext)}</span>
                ),
              },
              {
                key: 'awayTeamName',
                header: '원정',
                render: (f) => (
                  <span className="font-medium text-[var(--text-strong)] break-keep break-words">{fixtureSideLabel(f, 'AWAY', sideLabelContext)}</span>
                ),
              },
              {
                key: 'scheduledAt',
                header: '시각 · 구장',
                render: (f) => <span className="tm-text-caption text-[var(--text-muted)] break-words">{f.scheduledAt ? `${formatKstDateShort(f.scheduledAt)} ${formatKstTime(f.scheduledAt)}` : '시간 미정'} · {f.venue || '구장 미정'}</span>,
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
            rows={scheduleRows}
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
              const resultConsoleLabel = f.result ? '결과 고치기 화면 열기' : '결과 검토하러 가기';
              // T6-4: 아직 뛰고 있거나 곧 시작할 경기는 결과 검토보다 라이브 운영 콘솔이
              // 우선이다 — 같은 자리에 "운영 콘솔 열기"를 추가로 노출한다.
              const canOperate = f.status === 'scheduled' || f.status === 'in_progress';
              const operateHref = `/admin/live/${encodeURIComponent(tournamentId)}/fixtures/${encodeURIComponent(f.id)}/operate`;
              return (
                <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-2 lg:flex-nowrap">
                  <button
                    type="button"
                      onClick={() => openFixtureEditor(f)}
                    aria-label={`${bracketFixtureLabel(f, groups)} 수정`}
                    className="tm-on-tint inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-xs font-medium whitespace-nowrap text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    <Pencil size={12} aria-hidden="true" /> 수정
                  </button>
                  {Object.keys(BRACKET_SOURCE_PHASES).includes(groups.find((group) => group.id === f.groupId)?.phase ?? '') && (
                    <button type="button" className="tm-chip" onClick={() => {
                      setSourceFixture(f);
                      setHomeSource(f.bracketSources?.find((source) => source.side === 'HOME')?.fixtureId ?? '');
                      setAwaySource(f.bracketSources?.find((source) => source.side === 'AWAY')?.fixtureId ?? '');
                    }}>진출 연결</button>
                  )}
                  {canOperate && (
                    <Link
                      href={operateHref}
                      aria-label={`${bracketFixtureLabel(f, groups)} 운영 콘솔 열기`}
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
                    aria-label={`${bracketFixtureLabel(f, groups)} ${resultConsoleLabel}`}
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
                  {!f.result && !groups.some(group => group.id === f.groupId && group.bracketTrack?.startsWith('stage:')) && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteFixture(f)}
                      aria-label={`${bracketFixtureLabel(f, groups)} 삭제`}
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
      <SimpleModal open={!!sourceFixture} title="진출 경기 연결" onClose={() => { if (!savingSources) setSourceFixture(null); }}>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (!sourceFixture || savingSources) return;
          setSavingSources(true);
          try {
            await v1Patch(`/admin/fixtures/${sourceFixture.id}/bracket-sources`, { homeSourceFixtureId: homeSource || null, awaySourceFixtureId: awaySource || null });
            await refetch();
            setSourceFixture(null);
            showToast('진출 연결을 저장했어요.', 'success');
          } catch (err) { showToast(extractErrorMessage(err, '진출 연결 저장에 실패했어요.'), 'error'); }
          finally { setSavingSources(false); }
        }}>
          <p className="tm-text-caption">미정인 자리에 이전 경기의 승자를 연결해요. 3·4위전에는 4강 패자가 연결돼요. 결과 확정 시 기존 진출 처리로 팀이 배정돼요.</p>
          {(['HOME', 'AWAY'] as const).map((side) => {
            const candidates = sourceFixture && bracket
              ? bracketSourceCandidates({ target: sourceFixture, groups, fixtures: bracket.fixtures })
              : [];
            const currentSource = side === 'HOME' ? homeSource : awaySource;
            const oppositeSource = side === 'HOME' ? awaySource : homeSource;
            const options = sourceFixture && bracket
              ? bracketSourceSideOptions({ candidates, fixtures: bracket.fixtures, currentFixtureId: currentSource, oppositeFixtureId: oppositeSource })
              : [];
            const targetPhase = groups.find((group) => group.id === sourceFixture?.groupId)?.phase ?? '';
            return <label key={side} className="block tm-text-label">{side === 'HOME' ? '홈 자리' : '원정 자리'}
              <select className={inputCls} disabled={savingSources} value={options.some((fixture) => fixture.id === currentSource) ? currentSource : ''} onChange={(event) => side === 'HOME' ? setHomeSource(event.target.value) : setAwaySource(event.target.value)}>
                <option value="">연결 없음 · 직접 배정</option>
                {options.map((fixture) => <option key={fixture.id} value={fixture.id}>{bracketFixtureLabel(fixture, groups)} {targetPhase === 'third_place' ? '패자' : '승자'}</option>)}
              </select>
            </label>;
          })}
          <button type="submit" className={submitBtnCls} disabled={savingSources || (homeSource !== '' && homeSource === awaySource)}>{savingSources ? '저장 중…' : '연결 저장'}</button>
        </form>
      </SimpleModal>

      <SimpleModal
        open={editFixture !== null}
        title="경기 수정"
        onClose={() => setEditFixture(null)}
        pending={updateFixture.isPending || savingFixtureEdit || assignTournamentSlot.isPending}
      >
        <form onSubmit={handleUpdateFixture} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={editNumberId} className="text-[length:var(--font-size-label)] text-[var(--text-strong)]">대진 번호</label>
            <input id={editNumberId} type="number" inputMode="numeric" min={1} max={2147483647} step={1}
              value={editFxNumber} onChange={(e) => setEditFxNumber(e.target.value)}
              disabled={updateFixture.isPending} className={inputCls} />
          </div>
          {editFixture ? <FixtureLabelFields fixture={editFixture} groups={groups} fixtures={bracket?.fixtures ?? []} slots={bracket?.slots ?? []} value={editFxLabels} onChange={setEditFxLabels} disabled={savingFixtureEdit || updateFixture.isPending} /> : null}
          <div className="flex flex-col gap-1">
            <FixtureTimePicker tournamentId={tournamentId} fixtures={fixtures} value={editFxScheduledAt} onChange={setEditFxScheduledAt} disabled={savingFixtureEdit || updateFixture.isPending} />
          <label htmlFor="edit-fx-scheduled" className="text-[length:var(--font-size-label)] text-[var(--text-strong)]">경기 일시</label>
            <input
              id="edit-fx-scheduled"
              type="datetime-local"
              value={editFxScheduledAt}
              onChange={(e) => setEditFxScheduledAt(e.target.value)}
              disabled={updateFixture.isPending}
              className={inputCls}
            />
          </div>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost self-start min-h-[44px]" disabled={savingFixtureEdit || updateFixture.isPending || !editFxScheduledAt} onClick={() => setEditFxScheduledAt('')}>시각 비우기</button>
          <PeriodOverrideField
            inheritedSummary={fixturePeriods.inheritedSummary}
            customLabel="이 경기만 따로"
            customHint="이 경기만 바뀌어요. 조·단계 설정과 대회 기본값은 그대로예요."
            status={fixturePeriods.status}
            choice={fixturePeriods.choice}
            onChange={fixturePeriods.setChoice}
            disabled={savingFixtureEdit || updateFixture.isPending}
            lockedReason={fixturePeriods.lockedReason}
          />
          <CompetitionFieldPicker tournamentId={tournamentId} value={editFxFieldId} onChange={value => { setEditFxFieldId(value); if (!value) setEditFxVenue(null); }} allowNew={false} allowEmpty emptyLabel="구장 미정" disabled={savingFixtureEdit || updateFixture.isPending} />
          {!editFxFieldId ? <PlacePicker
            maxLength={PLACE_NAME_MAX_LENGTH.tournament}
            id="edit-fx-venue"
            label="장소"
            value={editFxVenue}
            onChange={setEditFxVenue}
            disabled={updateFixture.isPending}
            placeholder="예: 성산 풋살파크 A구장"
          /> : null}
          {editFxError ? <p role="alert" className="tm-text-caption text-[var(--red700)]">{editFxError}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex min-w-0 flex-col gap-1 flex-1">
              <label htmlFor="edit-fx-home" className="text-[length:var(--font-size-label)] text-[var(--text-strong)]">홈 팀</label>
              <EntityPicker
                id="edit-fx-home"
                value={editFixtureTeamItems.find((it) => it.id === editFxHomeRegId) ?? null}
                onChange={(item) => setEditFxHomeRegId(item?.id ?? '')}
                items={editPickerItems(editFxHomeRegId, editFxAwayRegId, editFixture?.homeSlotId ?? null)}
                disabled={updateFixture.isPending || savingFixtureEdit || editFixtureTeamsLocked || slotSideLocked('HOME') || !!editFixture?.bracketSources?.some((source) => source.side === 'HOME')}
                clearLabel="미정"
                placeholder="홈 팀 검색"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1 flex-1">
              <label htmlFor="edit-fx-away" className="text-[length:var(--font-size-label)] text-[var(--text-strong)]">원정 팀</label>
              <EntityPicker
                id="edit-fx-away"
                value={editFixtureTeamItems.find((it) => it.id === editFxAwayRegId) ?? null}
                onChange={(item) => setEditFxAwayRegId(item?.id ?? '')}
                items={editPickerItems(editFxAwayRegId, editFxHomeRegId, editFixture?.awaySlotId ?? null)}
                disabled={updateFixture.isPending || savingFixtureEdit || editFixtureTeamsLocked || slotSideLocked('AWAY') || !!editFixture?.bracketSources?.some((source) => source.side === 'AWAY')}
                clearLabel="미정"
                placeholder="원정 팀 검색"
              />
            </div>
          </div>
          {editFixtureTeamsLocked && (
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] m-0">
              {editFixtureAccess === 'official'
                ? '공식 결과가 확정된 경기는 팀을 바꿀 수 없어요. 결과를 먼저 무효로 돌려 주세요.'
                : '취소된 경기는 팀을 바꿀 수 없어요.'}
            </p>
          )}
          {(slotSideLocked('HOME') || slotSideLocked('AWAY')) && (
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] m-0">자리로 관리되는 팀은 시작 후 바꿀 수 없어요.</p>
          )}
          {editFixture?.bracketSources?.length ? (
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] m-0">이전 경기 결과로 연결된 팀은 여기서 직접 바꿀 수 없어요. ‘진출 연결’에서 출처를 수정해 주세요.</p>
          ) : null}
          {editFixtureAccess === 'started' && (
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] m-0">시작된 경기예요. 팀을 바꾸면 그 팀의 명단과 기록이 지워져요.</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditFixture(null)}
              disabled={updateFixture.isPending}
              className="tm-on-tint flex-1 h-[44px] rounded-xl text-[length:var(--font-size-label)] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
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
        pending={updateGroup.isPending || groupPeriods.pending}
      >
        <form onSubmit={handleUpdateGroup} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-group-name" className="text-[length:var(--font-size-label)] text-[var(--text-strong)]">조 이름</label>
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
          {tournamentFormat !== 'league_knockouts' ? <div className="flex flex-col gap-1">
            <label htmlFor="edit-group-advance" className="text-[length:var(--font-size-label)] text-[var(--text-strong)]">진출 팀 수 (선택)</label>
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
          </div> : null}
          {editGroup?.phase === 'group' && tournamentFormat !== 'league_knockouts' ? (
            <PeriodOverrideField
              inheritLabel={groupPeriods.inheritLabel}
              inheritedSummary={groupPeriods.inheritedSummary}
              customLabel="이 조만 따로"
              customHint="이 조의 시작 전 경기와 앞으로 만들 경기만 바뀌어요. 경기에서 따로 정한 값과 조별리그 설정·대회 기본값은 그대로예요."
              status={groupPeriods.status}
              choice={groupPeriods.choice}
              onChange={groupPeriods.setChoice}
              disabled={updateGroup.isPending || groupPeriods.pending}
            />
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditGroup(null)}
              disabled={updateGroup.isPending}
              className="tm-on-tint flex-1 h-[44px] rounded-xl text-[length:var(--font-size-label)] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            >
              취소
            </button>
            <button type="submit" disabled={updateGroup.isPending || groupPeriods.pending || !editGroupName.trim()} className={'flex-1 ' + submitBtnCls}>
              {updateGroup.isPending || groupPeriods.pending ? '저장 중…' : '저장'}
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
          <div className="flex flex-col gap-2">
            <label htmlFor="league-fixtures-legs" className="text-[length:var(--font-size-label)] text-[var(--text-strong)]">회전 수</label>
            <select
              id="league-fixtures-legs"
              value={legsPickerValue}
              onChange={(e) => setLegsPickerValue(e.target.value as '1' | '2')}
              disabled={isGeneratingLeague}
              className={inputCls}
            >
              <option value="1">1회전 (싱글 라운드로빈)</option>
              <option value="2">2회전 (홈/원정 더블 라운드로빈)</option>
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
              className="tm-on-tint flex-1 h-[44px] rounded-xl text-[length:var(--font-size-label)] text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--grey300)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
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
