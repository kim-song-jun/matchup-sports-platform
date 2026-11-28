import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stagePlanCounts, stagePlanError } from '@/lib/stage-plan';
import { TOURNAMENT_FORMAT_NAMES } from '@/lib/tournament-format-labels';
import {
  CREATE_FORMAT_OPTIONS,
  DEFAULT_GENDER_CATEGORY,
  buildCreatePayload,
  createFormReducer,
  describeFormatOutcome,
  initialCreateFormState,
  isShortLeadTime,
  registrationDeadlineHint,
  remainingRequiredLabels,
  stagePlanForTeamCount,
  summarizeBarStatus,
  validateCreateForm,
  type CreateFormAction,
  type CreateFormState,
} from './create-form-model';

// 테스트 러너의 TZ 는 UTC 라 입력값을 KST 벽시계로 해석하지 않으면 9시간 어긋난다.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-11-27T00:00:00+09:00');
});
afterEach(() => {
  vi.useRealTimers();
});

function apply(state: CreateFormState, ...actions: CreateFormAction[]) {
  return actions.reduce(createFormReducer, state);
}

function filled(overrides: Partial<CreateFormState> = {}): CreateFormState {
  return {
    ...initialCreateFormState(),
    sportId: 's1',
    title: '  겨울컵 ',
    scheduledAt: '2026-12-20T09:00',
    registrationDeadlineAt: '2026-12-17T23:59',
    ...overrides,
  };
}

describe('신청 마감 자동값', () => {
  it('시작을 고르면 3일 전 밤으로 채우고, 직접 고친 뒤에는 시작을 바꿔도 지키며, 지워도 다시 채우지 않는다', () => {
    const start = apply(initialCreateFormState(), { type: 'set-scheduled-at', value: '2026-12-20T09:00' });
    expect(start.registrationDeadlineAt).toBe('2026-12-17T23:59');

    const edited = apply(
      start,
      { type: 'set-registration-deadline', value: '2026-12-10T18:00' },
      { type: 'set-scheduled-at', value: '2026-12-25T09:00' },
    );
    expect(edited.registrationDeadlineAt).toBe('2026-12-10T18:00');

    const cleared = apply(
      edited,
      { type: 'set-registration-deadline', value: '' },
      { type: 'set-scheduled-at', value: '2026-12-28T09:00' },
    );
    expect(cleared.registrationDeadlineAt).toBe('');
  });

  it('시작이 3일 안쪽이면 마감을 채우지 않고 직접 정하라는 주의를 낸다', () => {
    const state = apply(initialCreateFormState(), { type: 'set-scheduled-at', value: '2026-11-29T09:00' });
    expect(state.registrationDeadlineAt).toBe('');
    expect(registrationDeadlineHint(state)).toEqual({
      tone: 'warning',
      text: '대회가 곧 시작해서 미리 채우지 않았어요. 직접 정해 주세요.',
    });
    expect(isShortLeadTime('2026-11-29T09:00')).toBe(true);
  });

  it('과거 시작은 임박한 시작이 아니고 마감도 제안하지 않는다', () => {
    expect(isShortLeadTime('2026-11-20T09:00')).toBe(false);
    expect(isShortLeadTime('')).toBe(false);
    expect(apply(initialCreateFormState(), { type: 'set-scheduled-at', value: '2026-11-20T09:00' }).registrationDeadlineAt).toBe('');
  });

  it('안내 문구는 상태에 따라 바뀌고 직접 고친 뒤에는 사라진다', () => {
    const empty = initialCreateFormState();
    expect(registrationDeadlineHint(empty)).toEqual({ tone: 'info', text: '대회 시작을 고르면 3일 전 밤으로 미리 채워요.' });

    const auto = apply(empty, { type: 'set-scheduled-at', value: '2026-12-20T09:00' });
    expect(registrationDeadlineHint(auto)).toEqual({ tone: 'info', text: '시작 3일 전 밤으로 미리 채웠어요. 바꿔도 돼요.' });

    const manual = apply(auto, { type: 'set-registration-deadline', value: '2026-12-10T18:00' });
    expect(registrationDeadlineHint(manual)).toBeNull();
  });

  it('임박 경계(지금 + 3일)를 KST 로 판정한다', () => {
    // 지금은 KST 11-27 00:00 이라 정확히 3일 뒤는 11-30 00:00 이다.
    expect(isShortLeadTime('2026-11-30T00:00')).toBe(true);
    expect(isShortLeadTime('2026-11-30T00:01')).toBe(false);
  });
});

describe('validateCreateForm', () => {
  it('빈 폼은 이 화면에 그려지는 네 칸만 오류로 가진다(팀 수 기본값은 통과)', () => {
    expect(validateCreateForm(initialCreateFormState())).toEqual({
      sportId: '종목을 선택해 주세요.',
      title: '대회명을 입력해 주세요.',
      scheduledAt: '대회 시작 일시를 선택해 주세요.',
      registrationDeadlineAt: '신청 마감 일시를 선택해 주세요.',
    });
  });

  it('시작이 과거면 시작 칸에서만 말한다', () => {
    const errors = validateCreateForm(filled({ scheduledAt: '2026-11-20T09:00', registrationDeadlineAt: '2026-12-01T23:59' }));
    expect(errors.scheduledAt).toBe('대회 시작 일시는 지금 이후여야 해요.');
    expect(errors.registrationDeadlineAt).toBeUndefined();
  });

  it('마감이 시작보다 늦거나 과거면 마감 칸에서 말한다', () => {
    expect(validateCreateForm(filled({ registrationDeadlineAt: '2026-12-21T09:00' })).registrationDeadlineAt)
      .toBe('신청 마감은 대회 시작 전이어야 해요.');
    expect(validateCreateForm(filled({ registrationDeadlineAt: '2026-11-26T23:59' })).registrationDeadlineAt)
      .toBe('신청 마감은 지금 이후여야 해요.');
    expect(validateCreateForm(filled())).toEqual({});
  });

  it.each(['', '1', '65', '8.5', 'abc', '0'])('팀 수 %j 는 범위 오류다', (teamCount) => {
    expect(validateCreateForm(filled({ teamCount })).teamCount).toBe('참가 팀 수는 2~64개여야 해요.');
  });

  it.each(['2', '64'])('팀 수 %s 는 통과한다', (teamCount) => {
    expect(validateCreateForm(filled({ teamCount })).teamCount).toBeUndefined();
  });

  describe('혼성 인원', () => {
    const mixed = (overrides: Partial<CreateFormState>) => filled({ genderCategory: 'mixed', ...overrides });

    it('최대가 대회 최대 선수 수(서버 기본 10)를 넘으면 genderQuota 오류다', () => {
      expect(validateCreateForm(mixed({ genderMaxMale: '11' })).genderQuota)
        .toBe('성별 최대 인원은 대회 최대 선수 수를 넘을 수 없어요.');
    });

    it('최소 합이 10 을 넘으면 genderQuota 오류다', () => {
      expect(validateCreateForm(mixed({ genderMinMale: '6', genderMinFemale: '5' })).genderQuota)
        .toBe('성별 최소 인원 합이 최대 선수 수를 넘을 수 없어요.');
    });

    it.each([
      ['genderMinMale', '-1', '남성 최소 인원은 0~50명 사이의 정수여야 해요.'],
      ['genderMaxMale', '1.5', '남성 최대 인원은 0~50명 사이의 정수여야 해요.'],
      ['genderMinFemale', '51', '여성 최소 인원은 0~50명 사이의 정수여야 해요.'],
      ['genderMaxFemale', '-3', '여성 최대 인원은 0~50명 사이의 정수여야 해요.'],
    ] as const)('%s=%s 는 칸 이름이 든 오류다', (field, value, message) => {
      expect(validateCreateForm(mixed({ [field]: value }))[field]).toBe(message);
    });

    it('최소가 최대보다 크면 최대 칸 오류다', () => {
      expect(validateCreateForm(mixed({ genderMinMale: '4', genderMaxMale: '2' })).genderMaxMale)
        .toBe('남성 최대 인원은 최소 인원보다 작을 수 없어요.');
      expect(validateCreateForm(mixed({ genderMinFemale: '4', genderMaxFemale: '2' })).genderMaxFemale)
        .toBe('여성 최대 인원은 최소 인원보다 작을 수 없어요.');
    });

    it('혼성이 아니면 같은 값이 있어도 오류가 없다', () => {
      const leftover = { genderMinMale: '6', genderMinFemale: '5', genderMaxMale: '99' };
      expect(validateCreateForm(filled({ genderCategory: 'male', ...leftover }))).toEqual({});
      expect(validateCreateForm(filled({ genderCategory: 'none', ...leftover }))).toEqual({});
    });
  });
});

describe('팀 수 스텝', () => {
  it('2~64 에서 멈추고 빈 칸에서는 2 로 시작한다', () => {
    const step = (teamCount: string, delta: 1 | -1) =>
      apply({ ...initialCreateFormState(), teamCount }, { type: 'step-team-count', delta }).teamCount;
    expect(step('2', -1)).toBe('2');
    expect(step('64', 1)).toBe('64');
    expect(step('8', 1)).toBe('9');
    expect(step('8', -1)).toBe('7');
    expect(step('', 1)).toBe('2');
    expect(step('', -1)).toBe('2');
    expect(step('100', -1)).toBe('64');
  });
});

describe('buildCreatePayload', () => {
  it.each([
    ['group_knockout', 'group_knockout'],
    ['knockout', 'knockout'],
    ['league', 'league'],
  ] as const)('%s 는 서버가 채우는 값을 하나도 덮지 않는 최소 필드만 보낸다', (choice, format) => {
    const payload = buildCreatePayload(filled({ format: choice }));
    expect(payload).toStrictEqual({
      sportId: 's1',
      title: '겨울컵',
      format,
      scheduledAt: '2026-12-20T00:00:00.000Z',
      registrationDeadlineAt: '2026-12-17T14:59:00.000Z',
      teamCount: 8,
    });
  });

  it('성별 구분 없음은 genderCategory 를 보내지 않고, 남성부는 쿼터를 입력해 뒀어도 보내지 않는다', () => {
    const leftover = { genderMinMale: '2', genderMaxFemale: '5' };
    expect(buildCreatePayload(filled({ genderCategory: 'none', ...leftover }))).not.toHaveProperty('genderCategory');
    const male = buildCreatePayload(filled({ genderCategory: 'male', ...leftover }));
    expect(male.genderCategory).toBe('male');
    expect(Object.keys(male).filter((key) => key.startsWith('genderM'))).toEqual([]);
  });

  it('혼성은 채운 칸만 보낸다', () => {
    const payload = buildCreatePayload(filled({ genderCategory: 'mixed', genderMinMale: '2' }));
    expect(payload.genderCategory).toBe('mixed');
    expect(payload.genderMinMale).toBe(2);
    expect(Object.keys(payload).filter((key) => key.startsWith('genderM'))).toEqual(['genderMinMale']);
  });

  it('혼성 → 남성부 → 혼성 으로 돌아와도 입력이 남아 있다', () => {
    const state = apply(
      filled({ genderCategory: 'mixed' }),
      { type: 'set-field', field: 'genderMinMale', value: '2' },
      { type: 'set-gender', value: 'male' },
    );
    expect(state.genderMinMale).toBe('2');
    expect(buildCreatePayload(state)).not.toHaveProperty('genderMinMale');
    const back = apply(state, { type: 'set-gender', value: 'mixed' });
    expect(back.genderMinMale).toBe('2');
    expect(buildCreatePayload(back).genderMinMale).toBe(2);
  });

  it('여러 단계는 league_knockouts 와 팀 수에 맞는 stagePlan 을 함께 보내고, 다른 형식으로 바꾸면 stagePlan 이 사라진다', () => {
    const staged = filled({ format: 'staged', teamCount: '24' });
    const payload = buildCreatePayload(staged);
    expect(payload.format).toBe('league_knockouts');
    expect(payload.stagePlan).toBeDefined();
    expect(stagePlanCounts(payload.stagePlan!).teams).toBe(24);

    const back = apply(staged, { type: 'set-format', value: 'knockout' });
    expect(back.teamCount).toBe('24');
    const backPayload = buildCreatePayload(back);
    expect(backPayload.format).toBe('knockout');
    expect(backPayload).not.toHaveProperty('stagePlan');
  });
});

describe('stagePlanForTeamCount', () => {
  it('2~64팀 모두 서버 검증을 통과하는 구성이다', () => {
    for (let teams = 2; teams <= 64; teams += 1) {
      const plan = stagePlanForTeamCount(teams);
      expect(stagePlanError(plan), `${teams}팀`).toBeNull();
      expect(stagePlanCounts(plan).teams).toBe(teams);
      for (const pool of plan.stages[0].pools) expect(pool.capacity).toBeLessThanOrEqual(8);
    }
  });

  it('8팀 이하는 「예선 리그」 하나, 그보다 크면 A조·B조…로 고르게 나눈다', () => {
    const eight = stagePlanForTeamCount(8);
    expect(eight.stages).toHaveLength(1);
    expect(eight.stages[0].key).toBe('preliminary');
    expect(eight.stages[0].pools.map((pool) => [pool.name, pool.capacity])).toEqual([['예선 리그', 8]]);

    const many = stagePlanForTeamCount(24);
    expect(many.stages[0].pools.map((pool) => pool.name)).toEqual(['A조', 'B조', 'C조']);
    expect(many.stages[0].pools.map((pool) => pool.capacity)).toEqual([8, 8, 8]);

    expect(stagePlanForTeamCount(9).stages[0].pools.map((pool) => pool.capacity)).toEqual([5, 4]);
  });

  it('조 키는 서로 다르고 모든 조는 한 번씩 겨루는 풀리그다', () => {
    const pools = stagePlanForTeamCount(40).stages[0].pools;
    expect(new Set(pools.map((pool) => pool.key)).size).toBe(pools.length);
    for (const pool of pools) {
      expect(pool).toMatchObject({ format: 'league', legs: 1, sources: [] });
    }
  });
});

describe('describeFormatOutcome', () => {
  it.each([
    ['group_knockout', 8, 'A·B조 4팀씩 → 4강 → 결승, 경기 15개로 치러요.'],
    ['group_knockout', 7, '조 편성은 신청이 끝난 뒤 대진을 만들 때 정해요.'],
    ['knockout', 8, '8강 → 4강 → 결승, 경기 7개로 치러요.'],
    ['knockout', 10, '대진은 신청이 끝난 뒤 만들 때 정해요.'],
    ['league', 6, '모든 팀이 한 번씩 겨뤄 경기 15개로 치러요.'],
    ['staged', 8, '예선 8팀 리그(경기 28개)로 시작해요. 결선은 대진에서 이어서 짜요.'],
    ['staged', 24, '예선 3개 조(경기 84개)로 시작해요. 결선은 대진에서 이어서 짜요.'],
  ] as const)('%s %i팀', (format, teamCount, expected) => {
    expect(describeFormatOutcome(format, teamCount)).toBe(expected);
  });

  it('조가 셋 이상이면 A~C조 로 줄여 쓴다', () => {
    expect(describeFormatOutcome('group_knockout', 24)).toMatch(/^A~[C-H]조 /);
  });

  it('범위 밖 팀 수에는 문장을 만들지 않는다', () => {
    expect(describeFormatOutcome('league', 1)).toBe('');
    expect(describeFormatOutcome('league', 65)).toBe('');
    expect(describeFormatOutcome('league', Number.NaN)).toBe('');
  });
});

describe('하단 바', () => {
  it('남은 칸을 세고 문장으로 말한다', () => {
    const empty = initialCreateFormState();
    expect(remainingRequiredLabels(empty)).toEqual(['종목', '대회명', '대회 시작', '신청 마감']);
    expect(summarizeBarStatus(empty, {})).toEqual({ tone: 'todo', count: 4, text: '종목 외 3가지가 남았어요' });

    const named = { ...empty, sportId: 's1', title: '겨울컵' };
    expect(summarizeBarStatus(named, {})).toMatchObject({ tone: 'todo', count: 2, text: '대회 시작과 신청 마감이 남았어요' });

    const soon = apply(named, { type: 'set-scheduled-at', value: '2026-11-29T09:00' });
    expect(summarizeBarStatus(soon, {})).toMatchObject({ tone: 'todo', count: 1, text: '신청 마감이 남았어요' });
  });

  it('다 채우면 ok, 채운 칸에 오류가 있으면 그 칸 이름을 말한다', () => {
    const full = filled();
    expect(summarizeBarStatus(full, {})).toEqual({ tone: 'ok', text: '필수 정보를 모두 채웠어요' });
    expect(summarizeBarStatus(full, { registrationDeadlineAt: '신청 마감은 대회 시작 전이어야 해요.' }))
      .toEqual({ tone: 'error', text: '신청 마감을 고쳐 주세요' });
  });

  it('빈 칸에 붙은 오류만 있으면 남은 칸으로 말한다', () => {
    const empty = initialCreateFormState();
    expect(summarizeBarStatus(empty, validateCreateForm(empty)))
      .toEqual({ tone: 'todo', count: 4, text: '종목 외 3가지가 남았어요' });
  });
});

describe('형식 선택지', () => {
  it('진행 방식 4가지를 정해진 이름으로 보여 준다', () => {
    expect(CREATE_FORMAT_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ['group_knockout', TOURNAMENT_FORMAT_NAMES.group_knockout],
      ['knockout', TOURNAMENT_FORMAT_NAMES.knockout],
      ['league', TOURNAMENT_FORMAT_NAMES.league],
      ['staged', TOURNAMENT_FORMAT_NAMES.league_knockouts],
    ]);
  });

  it('처음 상태는 팀 수 8, 성별 기본값, 고른 진행 방식이다', () => {
    expect(initialCreateFormState()).toMatchObject({
      teamCount: '8',
      genderCategory: DEFAULT_GENDER_CATEGORY,
      format: 'group_knockout',
      registrationDeadlineDirty: false,
    });
    expect(initialCreateFormState('staged').format).toBe('staged');
  });
});
