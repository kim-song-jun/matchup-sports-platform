import type { V1TournamentFormat } from '@/types/api';

export type BracketToolKey =
  | 'random-fill' | 'standings-fill' | 'finalists' | 'team-tray' | 'stage-teams' | 'multi-finals-assign' | 'multi-finals-rules'
  | 'add-fixture' | 'link-fixtures' | 'template' | 'multi-finals-create' | 'reset'
  | 'time-assign' | 'court-assign' | 'unscheduled-only';

export interface BracketToolItem {
  key: BracketToolKey;
  label: string;
  description: string;
  destructive?: boolean;
  groupLabel?: string;
  disabledReason?: string | null;
}

export interface BracketToolContext {
  format: V1TournamentFormat | undefined;
  hasStagePlan: boolean;
  isEmpty: boolean;
  canWrite: boolean;
  leagueGrid: boolean;
  hasGroupPhase: boolean;
  hasGroupRankSlots: boolean;
  randomFillBlockedReason: string | null;
  formatUnknownReason: string | null;
  unplacedTeamCount: number;
  unscheduledCount: number;
  unscheduledOnly: boolean;
  /** 그림 보기인지. 참가팀 트레이는 그림 보기에만 있어 목록 보기에서는 「참가팀 목록 열기」를 내지 않는다. */
  canvasView: boolean;
}

export interface BracketToolMenus {
  teamFill: BracketToolItem[];
  match: BracketToolItem[];
  timeVenue: BracketToolItem[];
}

export type BracketCreateKey = 'template' | 'stage' | 'multi-finals-create';

const TEMPLATE_FORMATS: readonly V1TournamentFormat[] = ['knockout', 'league', 'group_knockout'];

export function hasGroupRankSlots(slots: ReadonlyArray<{ kind: string; sourceGroupId?: string | null }>): boolean {
  return slots.some(slot => slot.kind === 'GROUP_RANK' && Boolean(slot.sourceGroupId));
}

export function bracketCreateAction(ctx: Pick<BracketToolContext, 'format' | 'hasStagePlan' | 'canWrite'>): { key: BracketCreateKey; label: string } | null {
  if (!ctx.canWrite) return null;
  if (ctx.hasStagePlan) return { key: 'stage', label: '단계대로 대진 만들기' };
  if (ctx.format === 'league_knockouts') return { key: 'multi-finals-create', label: '예선·토너먼트 대진 생성' };
  if (ctx.format !== undefined && TEMPLATE_FORMATS.includes(ctx.format)) return { key: 'template', label: '템플릿으로 대진 만들기' };
  return null;
}

export function buildBracketToolMenus(ctx: BracketToolContext): BracketToolMenus {
  if (!ctx.canWrite || ctx.isEmpty) return { teamFill: [], match: [], timeVenue: [] };
  const legacyFinals = !ctx.hasStagePlan && ctx.format === 'league_knockouts';
  const regular = !ctx.hasStagePlan && !legacyFinals;

  const teamFill: BracketToolItem[] = [];
  if (ctx.hasStagePlan) {
    teamFill.push({ key: 'stage-teams', label: '단계·진출팀 관리', description: '단계별 참가팀과 진출 방식을 정해요' });
  } else if (legacyFinals) {
    teamFill.push(
      { key: 'multi-finals-assign', label: '토너먼트별 진출팀 배정', description: '예선 결과로 토너먼트마다 진출팀을 넣어요' },
      { key: 'multi-finals-rules', label: '토너먼트 배정 규칙', description: '순위별로 어느 토너먼트에 가는지 정해요' },
    );
  } else {
    teamFill.push({ key: 'random-fill', label: '빈 자리 무작위 채우기', description: '확정 팀을 비어 있는 자리에 골고루 넣어요', disabledReason: ctx.randomFillBlockedReason });
    if (ctx.hasGroupRankSlots) {
      teamFill.push({ key: 'standings-fill', label: '조 순위대로 채우기', description: '조별리그가 끝나면 순위에 맞춰 결선 자리에 넣어요' });
    }
    if (ctx.format === 'group_knockout' && ctx.hasGroupPhase) {
      teamFill.push({ key: 'finalists', label: '결선 진출팀 직접 정하기', description: '순위와 다르게 넣어야 할 때 써요' });
    }
    if (ctx.canvasView) {
      teamFill.push({ key: 'team-tray', label: '참가팀 목록 열기', description: `팀을 골라 자리에 넣어요 · 자리 없는 팀 ${ctx.unplacedTeamCount}` });
    }
  }

  const match: BracketToolItem[] = [];
  if (regular) {
    match.push({ key: 'add-fixture', label: '경기 추가', description: '조나 라운드에 경기를 하나 더 만들어요', disabledReason: ctx.formatUnknownReason });
    if (!ctx.leagueGrid) {
      match.push({ key: 'link-fixtures', label: '경기 연결', description: '이긴 팀이 다음 경기로 올라가게 이어요', disabledReason: ctx.formatUnknownReason });
    }
    if (ctx.format !== undefined && TEMPLATE_FORMATS.includes(ctx.format)) {
      match.push({ key: 'template', label: '템플릿으로 다시 만들기', description: '조 수나 진출 방식을 바꿔 새로 짜요' });
    }
  } else if (legacyFinals) {
    match.push({ key: 'multi-finals-create', label: '예선·토너먼트 대진 생성', description: '예선 조를 편성하고 토너먼트를 만들어요' });
  }
  match.push({ key: 'reset', label: '대진 초기화', description: '모든 경기와 팀 자리를 지워요', destructive: true, groupLabel: '되돌릴 수 없는 작업' });

  const timeVenue: BracketToolItem[] = [
    { key: 'time-assign', label: '시간 일괄 배정', description: '시간을 등록하고 경기를 골라 넣어요' },
    { key: 'court-assign', label: '구장 일괄 배정', description: '구장을 고르고 경기를 골라 넣어요' },
    ctx.unscheduledOnly
      ? { key: 'unscheduled-only', label: '모든 경기 보기', description: '시간 미정 경기만 보는 중이에요' }
      : { key: 'unscheduled-only', label: '시간 미정 경기만 보기', description: `${ctx.unscheduledCount}경기가 아직 시간 미정이에요`,
          disabledReason: ctx.unscheduledCount === 0 ? '모든 경기에 시간이 있어요.' : null },
  ];

  return { teamFill, match, timeVenue };
}
