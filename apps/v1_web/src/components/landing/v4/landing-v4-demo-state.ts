/* 히어로 데모 상태. 가짜 데이터로 이 페이지 안에서만 움직인다(네트워크 요청 0건). */

export type DemoTab = 'home' | 'match' | 'cup' | 'team' | 'my';
export type SportFilter = '전체' | '축구' | '풋살' | '러닝' | '수영';
export type CupSub = 'bracket' | 'live';
export type RecordScope = 'all' | 'cup' | 'league' | 'friendly';
export type TryKey = 'apply' | 'goal' | 'bracket' | 'flip';
export type GoalSide = 'a' | 'b';

export type DemoMatch = {
  id: 'seongsu' | 'sunday' | 'run';
  sport: Exclude<SportFilter, '전체'>;
  title: string;
  meta: string;
  when: string;
  image: string;
  capacity: number;
  filled: number;
};

export type DemoEvent = { minute: number; side: GoalSide };

export type DemoToast = { id: number; title: string };

export type DemoState = {
  tab: DemoTab;
  filter: SportFilter;
  applied: Record<DemoMatch['id'], boolean>;
  cupSub: CupSub;
  score: Record<GoalSide, number>;
  /** 이 데모에서 추가한 골만(최신이 앞). 기본 기록은 화면이 고정으로 그린다. */
  goals: DemoEvent[];
  finals: [string, string];
  champion: string | null;
  record: RecordScope;
  flipped: boolean;
  tried: Record<TryKey, boolean>;
  /** 스크린리더 공지. 같은 문장이 반복돼도 다시 읽히게 seq 를 함께 올린다. */
  announce: { seq: number; text: string };
  toast: DemoToast | null;
};

export type DemoAction =
  | { type: 'tab'; tab: DemoTab; sub?: CupSub; announce?: boolean }
  | { type: 'filter'; filter: SportFilter; goToMatch?: boolean }
  | { type: 'apply'; id: DemoMatch['id']; silent?: boolean }
  | { type: 'cupSub'; sub: CupSub }
  | { type: 'goal'; side: GoalSide; silent?: boolean }
  | { type: 'resetScore' }
  | { type: 'pickSemi'; semi: 0 | 1; team: string; silent?: boolean }
  | { type: 'pickFinal'; slot: 0 | 1; silent?: boolean }
  | { type: 'record'; scope: RecordScope }
  | { type: 'flip' }
  | { type: 'dismissToast'; id: number }
  | { type: 'reset' };

export const DEMO_TABS: ReadonlyArray<{ key: DemoTab; label: string }> = [
  { key: 'home', label: '홈' },
  { key: 'match', label: '매치' },
  { key: 'cup', label: '대회' },
  { key: 'team', label: '팀' },
  { key: 'my', label: '마이' },
];

export const SPORT_FILTERS: readonly SportFilter[] = ['전체', '축구', '풋살', '러닝', '수영'];

export const DEMO_MATCHES: readonly DemoMatch[] = [
  { id: 'seongsu', sport: '풋살', title: '성수 저녁 풋살', meta: '풋살 · 입문-초보 · 혼성', when: '토요일 19:00 · 성동구', image: '/illustrations/sport-futsal-320.webp', capacity: 10, filled: 6 },
  { id: 'sunday', sport: '축구', title: '일요 아침 축구', meta: '축구 · 중급 · 11:11', when: '일요일 08:00 · 광진구', image: '/illustrations/sport-soccer-320.webp', capacity: 22, filled: 18 },
  { id: 'run', sport: '러닝', title: '한강 퇴근런', meta: '러닝 · 누구나 · 5km', when: '화요일 20:00 · 성동구', image: '/illustrations/sport-running-320.webp', capacity: 10, filled: 9 },
];

export const TEAM_NAMES: Record<GoalSide, string> = { a: 'FC 한강', b: '성수 러너스' };
export const SEMIS: readonly [readonly [string, string], readonly [string, string]] = [
  ['FC 한강', '망원 FC'],
  ['성수 러너스', '합정 SC'],
];

export const RECORDS: Record<RecordScope, { label: string; w: number; d: number; l: number }> = {
  all: { label: '전체', w: 11, d: 3, l: 4 },
  cup: { label: '대회', w: 4, d: 1, l: 1 },
  league: { label: '리그', w: 5, d: 1, l: 2 },
  friendly: { label: '친선', w: 2, d: 1, l: 1 },
};

const TAB_LABEL: Record<DemoTab, string> = { home: '홈', match: '매치', cup: '대회', team: '팀', my: '마이' };
const INITIAL_SCORE: Record<GoalSide, number> = { a: 2, b: 1 };
/** 기본 기록의 마지막 골이 27분이라 추가 골은 그 뒤로 붙인다. */
const FIRST_ADDED_MINUTE = 28;

export const INITIAL_DEMO_STATE: DemoState = {
  tab: 'home',
  filter: '전체',
  applied: { seongsu: false, sunday: false, run: false },
  cupSub: 'bracket',
  score: INITIAL_SCORE,
  goals: [],
  finals: [SEMIS[0][0], SEMIS[1][0]],
  champion: null,
  record: 'all',
  flipped: false,
  tried: { apply: false, goal: false, bracket: false, flip: false },
  announce: { seq: 0, text: '' },
  toast: null,
};

export function filledCount(state: DemoState, match: DemoMatch): number {
  return match.filled + (state.applied[match.id] ? 1 : 0);
}

export function matchBadge(filled: number, capacity: number): { tone: 'green' | 'grey'; label: string } {
  if (filled >= capacity) return { tone: 'grey', label: '마감' };
  if (capacity - filled <= 1) return { tone: 'grey', label: '마감 임박' };
  return { tone: 'green', label: '모집 중' };
}

export function visibleMatches(filter: SportFilter): DemoMatch[] {
  return DEMO_MATCHES.filter((match) => filter === '전체' || match.sport === filter);
}

export function scoreLine(score: Record<GoalSide, number>): string {
  return `${TEAM_NAMES.a} ${score.a} : ${score.b} ${TEAM_NAMES.b}`;
}

function say(state: DemoState, text: string): DemoState['announce'] {
  return { seq: state.announce.seq + 1, text };
}

function markTried(state: DemoState, key: TryKey, silent?: boolean): DemoState['tried'] {
  return silent ? state.tried : { ...state.tried, [key]: true };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'tab': {
      const next = { ...state, tab: action.tab, cupSub: action.sub ?? state.cupSub };
      return action.announce ? { ...next, announce: say(state, `${TAB_LABEL[action.tab]} 화면`) } : next;
    }
    case 'filter': {
      const count = visibleMatches(action.filter).length;
      return {
        ...state,
        filter: action.filter,
        tab: action.goToMatch ? 'match' : state.tab,
        announce: say(state, `${action.filter === '전체' ? '전체' : action.filter} 매치 ${count}개`),
      };
    }
    case 'apply': {
      const match = DEMO_MATCHES.find((m) => m.id === action.id);
      if (!match) return state;
      const wasApplied = state.applied[match.id];
      // 정원이 찬 매치에는 새로 신청할 수 없다(취소는 된다).
      if (!wasApplied && match.filled >= match.capacity) {
        return { ...state, announce: say(state, `${match.title}은 정원이 다 찼어요.`) };
      }
      const applied = { ...state.applied, [match.id]: !wasApplied };
      const filled = match.filled + (wasApplied ? 0 : 1);
      const text = wasApplied
        ? `${match.title} 신청 취소. 현재 ${filled}명 / ${match.capacity}명.`
        : `${match.title} 신청 완료. 현재 ${filled}명 / ${match.capacity}명. 체험용 예시예요.`;
      const toastId = (state.toast?.id ?? 0) + 1;
      return {
        ...state,
        applied,
        tried: wasApplied ? state.tried : markTried(state, 'apply', action.silent),
        announce: action.silent ? state.announce : say(state, text),
        toast: { id: toastId, title: wasApplied ? '신청을 취소했어요' : '신청했어요' },
      };
    }
    case 'cupSub':
      return { ...state, cupSub: action.sub };
    case 'goal': {
      const score = { ...state.score, [action.side]: state.score[action.side] + 1 };
      const minute = FIRST_ADDED_MINUTE + state.goals.length;
      return {
        ...state,
        score,
        goals: [{ minute, side: action.side }, ...state.goals],
        tried: markTried(state, 'goal', action.silent),
        announce: action.silent
          ? state.announce
          : say(state, `${TEAM_NAMES[action.side]} 득점. ${TEAM_NAMES.a} ${score.a} 대 ${score.b} ${TEAM_NAMES.b}.`),
      };
    }
    case 'resetScore':
      return { ...state, score: INITIAL_SCORE, goals: [], announce: say(state, `처음 점수로 돌아갔어요. ${scoreLine(INITIAL_SCORE)}.`) };
    case 'pickSemi': {
      const finals: [string, string] = [...state.finals];
      finals[action.semi] = action.team;
      return {
        ...state,
        finals,
        champion: null,
        tried: markTried(state, 'bracket', action.silent),
        announce: action.silent ? state.announce : say(state, `${action.team}가 결승에 올라갔어요.`),
      };
    }
    case 'pickFinal': {
      const champion = state.finals[action.slot];
      return {
        ...state,
        champion,
        tried: markTried(state, 'bracket', action.silent),
        announce: action.silent ? state.announce : say(state, `${champion} 우승! 대진표가 끝까지 채워졌어요.`),
      };
    }
    case 'record': {
      const r = RECORDS[action.scope];
      return { ...state, record: action.scope, announce: say(state, `${r.label} 전적 ${r.w}승 ${r.d}무 ${r.l}패.`) };
    }
    case 'flip': {
      const flipped = !state.flipped;
      const text = flipped
        ? '카드 뒷면: 공식 경기 기록이 자동으로 쌓이고, 등급은 활동량으로 올라가요. 공개 신원은 닉네임만 보여요.'
        : '카드 앞면: 한강 10번, 종합 78.';
      return { ...state, flipped, tried: markTried(state, 'flip'), announce: say(state, text) };
    }
    case 'dismissToast':
      return state.toast?.id === action.id ? { ...state, toast: null } : state;
    case 'reset':
      // 해 본 것 체크와 공지 번호는 남긴다 — 사용자가 한 일을 자동 시연이 지우면 안 된다.
      return { ...INITIAL_DEMO_STATE, tried: state.tried, announce: state.announce };
  }
}
