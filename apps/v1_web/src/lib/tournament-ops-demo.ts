/** Explicit simulator; no production IDs, API clients, account privileges or notifications. */
export const DEMO_STORAGE_KEY = 'teameet.tournament-ops-demo.v1';
export const DEMO_PATH = '/tournament-ops-demo';
export type DemoRole = 'director' | 'recorder' | 'participant';
export type DemoEvent = { teamId: string; playerId: string; kind: 'goal' | 'yellow'; minute: number };
export type DemoFixture = {
  id: string; label: string; home: string | null; away: string | null;
  status: 'scheduled' | 'live' | 'review' | 'official'; lineup: boolean; events: DemoEvent[];
  winner: string | null;
};
export const DEMO_TEAMS = [
  { id: 'blue', name: '블루 FC' }, { id: 'orange', name: '오렌지 FS' },
  { id: 'green', name: '그린 FC' }, { id: 'white', name: '화이트 FS' },
] as const;
export const demoTeam = (id: string | null) => DEMO_TEAMS.find((t) => t.id === id)?.name ?? '진출팀 대기';
export const demoPlayers = (teamId: string) => Array.from({ length: 6 }, (_, i) => ({
  id: `${teamId}-${i + 1}`, name: `${demoTeam(teamId)} 선수 ${i + 1}`, teamId,
}));
export const DEMO_PLAYERS = DEMO_TEAMS.flatMap((t) => demoPlayers(t.id));
export const demoPlayer = (id: string) => DEMO_PLAYERS.find((p) => p.id === id);
export type DemoState = {
  title: string; venue: string; prepared: boolean; confirmed: string[];
  fixtures: DemoFixture[]; awardPlayerId: string | null;
};
export type DemoCommand = { role: DemoRole } & (
  | { type: 'settings'; title: string; venue: string }
  | { type: 'confirm'; teamId: string }
  | { type: 'generate' }
  | { type: 'lineup' | 'start' | 'undo' | 'end'; fixtureId: string }
  | { type: 'event'; fixtureId: string; event: DemoEvent }
  | { type: 'officialize'; fixtureId: string; winnerTeamId?: string }
  | { type: 'award'; playerId: string }
);
type WithoutRole<T> = T extends { role: DemoRole } ? Omit<T, 'role'> : never;
export type DemoInput = WithoutRole<DemoCommand>;
export function createDemoState(): DemoState {
  return { title: 'Teameet 파트너컵', venue: '체험 풋살장 A코트', prepared: false, confirmed: [], fixtures: [], awardPlayerId: null };
}
export function demoScore(fixture: DemoFixture, teamId: string | null): number {
  return fixture.events.filter((e) => e.kind === 'goal' && e.teamId === teamId).length;
}
function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 80; }

/** Validation is also used to replay untrusted browser storage. Never coerce invalid history to success. */
export function applyDemoCommand(state: DemoState, command: DemoCommand): DemoState {
  requireCondition(command && typeof command === 'object', '체험 기록 형식이 올바르지 않아요.');
  const { role, type } = command;
  requireCondition(['director', 'recorder', 'participant'].includes(role), '체험 역할을 확인해 주세요.');
  requireCondition(role !== 'participant', '참가자 관점에서는 공개된 체험 결과만 볼 수 있어요.');
  const next: DemoState = structuredClone(state);
  if (type === 'settings' || type === 'confirm' || type === 'generate' || type === 'officialize' || type === 'award') {
    requireCondition(role === 'director', '이 작업은 디렉터 관점에서 체험할 수 있어요.');
  }
  switch (type) {
    case 'settings':
      requireCondition(text(command.title) && text(command.venue), '대회명과 장소를 1~80자로 입력해 주세요.');
      next.title = command.title.trim(); next.venue = command.venue.trim(); next.prepared = true; return next;
    case 'confirm':
      requireCondition(next.prepared, '먼저 대회 준비 설정을 저장해 주세요.');
      requireCondition(DEMO_TEAMS.some((t) => t.id === command.teamId), '샘플 참가팀을 선택해 주세요.');
      requireCondition(!next.confirmed.includes(command.teamId), '이미 확정된 샘플 팀이에요.');
      next.confirmed.push(command.teamId); return next;
    case 'generate': {
      requireCondition(next.confirmed.length === 4, '샘플 4팀을 모두 확정한 뒤 대진을 만들 수 있어요.');
      requireCondition(next.fixtures.length === 0, '대진이 이미 있어요. 다시 시작하려면 체험을 초기화해 주세요.');
      const fixture = (id: string, label: string, home: string | null, away: string | null): DemoFixture => ({ id, label, home, away, status: 'scheduled', lineup: false, events: [], winner: null });
      next.fixtures = [fixture('semi-1', '4강 1경기', 'blue', 'orange'), fixture('semi-2', '4강 2경기', 'green', 'white'), fixture('final', '결승', null, null)]; return next;
    }
    case 'award':
      requireCondition(next.fixtures.some((f) => f.status === 'official'), '체험 결과를 한 경기 이상 확정한 뒤 수상자를 정해 주세요.');
      requireCondition(typeof command.playerId === 'string' && demoPlayer(command.playerId), '샘플 선수를 선택해 주세요.');
      next.awardPlayerId = command.playerId; return next;
    case 'lineup': case 'start': case 'event': case 'undo': case 'end': case 'officialize': {
      const fixture = next.fixtures.find((f) => f.id === command.fixtureId);
      requireCondition(fixture, '샘플 대진을 먼저 만들어 주세요.');
      requireCondition(role !== 'recorder' || fixture.id === 'semi-1', '기록 담당자는 배정된 4강 1경기만 조작할 수 있어요.');
      requireCondition(fixture.home && fixture.away, '양쪽 진출팀이 정해진 뒤 진행할 수 있어요.');
      if (type === 'lineup') {
        requireCondition(fixture.status === 'scheduled', '경기 시작 전만 샘플 라인업을 준비할 수 있어요.');
        fixture.lineup = true;
      } else if (type === 'start') {
        requireCondition(fixture.status === 'scheduled' && fixture.lineup, '양 팀 샘플 라인업을 준비한 뒤 경기를 시작해 주세요.');
        fixture.status = 'live';
      } else if (type === 'event') {
        const event = command.event;
        requireCondition(fixture.status === 'live', '진행 중인 경기만 기록할 수 있어요.');
        requireCondition(event && typeof event === 'object' && ['goal', 'yellow'].includes(event.kind), '득점 또는 경고를 선택해 주세요.');
        requireCondition([fixture.home, fixture.away].includes(event.teamId) && demoPlayer(event.playerId)?.teamId === event.teamId, '이 경기 참가 선수를 선택해 주세요.');
        requireCondition(Number.isInteger(event.minute) && event.minute >= 0 && event.minute <= 120, '기록 시각은 0~120분으로 입력해 주세요.');
        requireCondition(fixture.events.length < 50, '한 경기의 체험 기록은 최대 50개예요.');
        fixture.events.push({ teamId: event.teamId, playerId: event.playerId, kind: event.kind, minute: event.minute });
      } else if (type === 'undo') {
        requireCondition(fixture.status === 'live' && fixture.events.length > 0, '진행 중인 경기의 마지막 기록만 취소할 수 있어요.');
        fixture.events.pop();
      } else if (type === 'end') {
        requireCondition(fixture.status === 'live', '진행 중인 경기만 종료할 수 있어요.'); fixture.status = 'review';
      } else if (command.type === 'officialize') {
        requireCondition(fixture.status === 'review', '종료된 체험 경기를 검토한 뒤 확정해 주세요.');
        const homeScore = demoScore(fixture, fixture.home); const awayScore = demoScore(fixture, fixture.away);
        const winner = homeScore === awayScore ? command.winnerTeamId : homeScore > awayScore ? fixture.home : fixture.away;
        requireCondition(winner && [fixture.home, fixture.away].includes(winner), '동점 경기의 승부차기 승리팀을 선택해 주세요.');
        fixture.winner = winner; fixture.status = 'official';
        const final = next.fixtures.find((f) => f.id === 'final');
        if (final && fixture.id === 'semi-1') final.home = winner;
        if (final && fixture.id === 'semi-2') final.away = winner;
      }
      return next;
    }
    default: throw new Error('지원하지 않는 체험 기록이에요. 체험을 초기화해 주세요.');
  }
}
export function replayDemoSession(raw: string | null): { state: DemoState; commands: DemoCommand[] } {
  if (raw === null) return { state: createDemoState(), commands: [] };
  requireCondition(raw.length <= 100_000, '체험 기록이 너무 커요. 초기화해 주세요.');
  const doc: unknown = JSON.parse(raw);
  requireCondition(doc && typeof doc === 'object' && 'version' in doc && doc.version === 1 && 'commands' in doc && Array.isArray(doc.commands) && doc.commands.length <= 200, '체험 기록이 손상됐거나 버전이 달라요. 초기화해 주세요.');
  const commands = doc.commands as DemoCommand[];
  return { state: commands.reduce(applyDemoCommand, createDemoState()), commands };
}
export function encodeDemoSession(commands: DemoCommand[]): string {
  requireCondition(commands.length <= 200, '체험 작업이 200개에 도달했어요. 초기화 후 다시 체험해 주세요.');
  return JSON.stringify({ version: 1, commands });
}
