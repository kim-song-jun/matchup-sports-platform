import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { GameScoreDto } from '../../games/dto/game-result.dto';
import {
  GameResultCorrectionChangesDto,
  SupersedeAndSubmitGameResultRevisionDto,
} from './tournament-result-review.dto';

/**
 * 정정(correction)·재제출(supersede) 본문의 HTTP 경계 검증 계약.
 *
 * ## 왜 DTO 레벨에서 따로 검증하는가
 *
 * `ValidationPipe`는 **HTTP 경계에서만** 돈다(main.ts). 이 레포의 기존
 * 통합 스펙들(`test/tournaments/tournament-officialize*.integration-spec.ts`)은
 * 컨트롤러를 거치지 않고 `TournamentResultReviewService`의 메서드를 직접
 * 호출하므로 **DTO 데코레이터가 한 줄도 실행되지 않는다**. 그래서
 * `actualParticipants: []`로 정정하는 기존 통합테스트들이 지금 "통과"하고
 * 있고(버그를 정답으로 박제), 데코레이터를 고쳐도 그 테스트들은 Red가 되지
 * 않는다. DTO 계약은 이렇게 `validate()`를 직접 부르는 스펙으로만 증명할 수
 * 있다.
 *
 * ## 프로덕션 파이프와 같은 옵션으로 검증한다
 *
 * `whitelist`/`forbidNonWhitelisted`/`enableImplicitConversion`은
 * `ValidationPipe` 옵션이지 `validate()`의 기본값이 아니다 — main.ts와 같은
 * 값을 명시해야 "프로덕션에서 통과/거부되는가"를 실제로 재현한다.
 */
const PIPE_TRANSFORM_OPTIONS = { enableImplicitConversion: true } as const;
const PIPE_VALIDATOR_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

const SIDE_ID = '5b3f6f2e-0000-4000-8000-00000000a001';
const PARTICIPANT_ID = '5b3f6f2e-0000-4000-8000-00000000b001';

/** 실제로 통과해야 하는 참가자 한 명 — 픽스처 자체가 옳다는 짝 증거용. */
const validParticipant = {
  participantId: PARTICIPANT_ID,
  sideId: SIDE_ID,
  started: true,
  goals: 1,
  cards: { yellow: 0, red: 0 },
  goalkeeper: false,
} as const;

async function validateAs<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<ValidationError[]> {
  const dto = plainToInstance(cls, plain, PIPE_TRANSFORM_OPTIONS);
  return validate(dto, PIPE_VALIDATOR_OPTIONS);
}

/** 실패한 프로퍼티 이름을 (중첩 포함) 평평하게 모은다. */
function failedProperties(errors: readonly ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
    const nested = error.children === undefined ? [] : failedProperties(error.children, path);
    return error.constraints === undefined ? nested : [path, ...nested];
  });
}

/**
 * `path` 자체 또는 그 하위 프로퍼티가 실패했는지 본다.
 *
 * 중첩 DTO를 `@ValidateNested()`로 검증하면 **부모에는 `constraints`가 없고
 * 실제 실패는 자식에 달린다**(실측: `penalties: {}` → 부모 `penalties`는
 * constraints=null, 자식 `home`/`away`가 `isInt`/`min` 위반). 그래서
 * `toContain('penalties')`처럼 부모 경로를 정확히 요구하면 **가드가 올바르게
 * 고쳐져도 테스트가 실패한다.** 실패 지점이 부모냐 자식이냐는 구현 세부이고
 * 계약이 아니므로, 접두사로 판정한다.
 */
function expectFailedAtOrUnder(errors: readonly ValidationError[], path: string): void {
  const failed = failedProperties(errors);
  expect(failed.some((entry) => entry === path || entry.startsWith(`${path}.`))).toBe(true);
}

const correctionChanges = (overrides: Record<string, unknown> = {}) => ({
  score: { home: 1, away: 0 },
  actualParticipants: [validParticipant],
  eventsHash: 'a'.repeat(64),
  ...overrides,
});

describe('GameResultCorrectionChangesDto — 정상 본문(짝 증거)', () => {
  it('참가자 한 명과 평평한 score를 담은 정상 정정 본문은 통과한다', async () => {
    await expect(validateAs(GameResultCorrectionChangesDto, correctionChanges())).resolves.toEqual([]);
  });

  it('승부차기까지 실은 정상 정정 본문도 통과한다', async () => {
    await expect(
      validateAs(
        GameResultCorrectionChangesDto,
        correctionChanges({ score: { home: 1, away: 1, penalties: { home: 5, away: 4 } } }),
      ),
    ).resolves.toEqual([]);
  });
});

/**
 * 2-B. `actualParticipants: []`로 정정하면 새 공식 리비전의
 * `v1_game_result_participants`가 0행이 된다. 개인 기록 화면
 * (`public-user-records.service.ts`)은 그 테이블을 직접 읽으므로, 그 경기의
 * **선수 개개인 기록이 전멸**한다 — 사용자가 보고한 "선수 개개인 기록이 정확히
 * 남지 않는다"의 서버측 원인 중 하나다.
 *
 * ## 그런데 이 가드는 DTO에 둘 수 없다 (`@ArrayNotEmpty()`를 쓰지 않는 이유)
 *
 * `@ArrayNotEmpty()`는 무조건적이다. 그런데 **정본 프로듀서가 정당하게 0행으로
 * 만드는 경기가 실재한다**: `GamesService.deriveTournamentRevision`의 출전
 * 게이트(`appearedIds`)는 선발 표시가 없고 이벤트도 없으면 참가자 행을 0개
 * 쓰고, 로스터가 빈 등록이나 TBD 브래킷 픽스처는 `v1GameParticipant` 자체가
 * 0행인 게임을 만든다(`tournament-bracket.service.ts`). 정정 폼은 base
 * 리비전에서만 참가자를 채우고 로스터 추가 수단이 없으므로
 * (`result-edit-modal.tsx`), `@ArrayNotEmpty()`를 붙이면 그런 경기의 **점수
 * 정정이 영구히 400**이 된다 — 가드를 조이다 정상 흐름을 막는 회귀다.
 *
 * 필요한 술어는 "비우지 말라"가 아니라 **"있던 것을 비우지 말라"**이고, base
 * 리비전을 읽어야 판단할 수 있어 DTO의 권한 밖이다. 아래 두 테스트는 그 설계
 * 결정을 못박는다: **HTTP 경계는 빈 배열을 통과시켜야** 서비스 가드가 base를
 * 보고 판정할 수 있다(서비스 쪽 계약은
 * `tournament-result-review.service.spec.ts`가 검증한다).
 */
describe('2-B: 빈 actualParticipants는 DTO가 아니라 서비스가 판정한다', () => {
  it('정정 본문의 빈 actualParticipants는 HTTP 경계를 통과한다(base 인식 가드로 넘긴다)', async () => {
    const errors = await validateAs(
      GameResultCorrectionChangesDto,
      correctionChanges({ actualParticipants: [] }),
    );

    expect(failedProperties(errors)).not.toContain('actualParticipants');
  });

  it('재제출(supersede) 본문의 빈 actualParticipants도 마찬가지로 통과한다', async () => {
    const errors = await validateAs(SupersedeAndSubmitGameResultRevisionDto, {
      expectedVersion: 3,
      clientCommandId: 'correction-guards-supersede',
      score: { home: 1, away: 0 },
      actualParticipants: [],
      eventsHash: 'a'.repeat(64),
      reason: '재제출',
    });

    expect(failedProperties(errors)).not.toContain('actualParticipants');
  });

  it('배열이 아닌 actualParticipants는 여전히 거부한다(가드를 통째로 잃지 않았다는 짝 증거)', async () => {
    const errors = await validateAs(
      GameResultCorrectionChangesDto,
      correctionChanges({ actualParticipants: 'none' }),
    );

    expect(failedProperties(errors)).toContain('actualParticipants');
  });
});

/**
 * 2-G. `GameScoreDto.penalties`가 `@IsOptional() @IsObject()`뿐이라
 * `{}`·`{home:'a'}`·`{home:1}`·`{home:-1,away:0}`·`[]`가 전부 통과한다.
 * 그 값은 `jsonInput`을 타고 `v1_game_result_revisions.score.penalties`에
 * 그대로 박히고, officialize 이후 아웃박스 핸들러의 두 번째 줄
 * (`parse-official-score.ts`의 `parseOfficialPenalties`)이 **throw**한다 →
 * 워커가 6회 재시도 끝에 잡을 **POISONED**로 남긴다. 운영자에게는 "성공"만
 * 보인다.
 *
 * 같은 파일에 이미 `PenaltyScoreDto`(`@IsInt() @Min(0)` × 2)가 있고
 * `GameResultRecoveryDto.penalties`가 `@ValidateNested() @Type(() =>
 * PenaltyScoreDto)`로 쓰고 있다 — 새 DTO를 만들 필요 없이 그 선례를
 * `GameScoreDto.penalties`에 적용하면 된다.
 *
 * `penalties: null`도 여기서 잡는다. `@IsOptional()`은 null에서 검증 전체를
 * 건너뛰므로 잡히지 않았지만, `@ValidateIf(값 !== undefined)`로 바꾸면 null이
 * `@IsObject()`에 걸린다. 이 DTO는 **서비스 가드가 없는 팀 매치 레인**
 * (`CreateGameResultRevisionDto` → `GamesService.createResultRevision`은
 * `jsonInput(dto.score)`를 그대로 저장한다)도 공유하므로, 대회 레인의
 * `extractEndPenalties`에만 맡길 수 없다. 대회 레인에서는 그 서비스 가드가
 * 두 번째 겹으로 남아 "동점 승부차기"까지 422로 거부한다
 * (`tournament-result-review.service.spec.ts`).
 */
describe('2-G: penalties는 강타입 검증을 통과해야 한다', () => {
  const rejected: ReadonlyArray<readonly [string, unknown]> = [
    ['빈 객체', {}],
    ['home이 문자열', { home: 'a', away: 0 }],
    ['away 누락', { home: 1 }],
    ['음수', { home: -1, away: 0 }],
    ['소수', { home: 1.5, away: 0 }],
    ['여분 키', { home: 5, away: 4, shooters: 11 }],
  ];

  it.each(rejected)('정정 본문의 penalties가 %s이면 거부한다', async (_label, penalties) => {
    const errors = await validateAs(
      GameResultCorrectionChangesDto,
      correctionChanges({ score: { home: 1, away: 1, penalties } }),
    );

    expectFailedAtOrUnder(errors, 'score.penalties');
  });

  it.each(rejected)('공유 GameScoreDto도 penalties가 %s이면 거부한다', async (_label, penalties) => {
    const errors = await validateAs(GameScoreDto, { home: 1, away: 1, penalties });

    expectFailedAtOrUnder(errors, 'penalties');
  });

  /**
   * ⚠️ 회귀 함정 — 이 테스트는 **오늘 이미 통과한다.** 고치는 과정에서 깨뜨리지 말 것.
   *
   * 현행 `@IsObject()`는 배열을 거부한다. 그런데 그것을
   * `@ValidateNested() @Type(() => PenaltyScoreDto)`로 **교체**하면 `[]`가
   * **무검증 통과한다** — 실측으로 확인했다(`GameResultRecoveryDto.penalties`에
   * `[]`를 넣으면 위반 0건). 그러면 `score.penalties = []`가 DB에 박히고
   * `parseOfficialPenalties([])`가 throw해 다시 POISONED가 된다. 즉 이 결함을
   * 고치다가 같은 결함을 다른 입구로 재도입하게 된다.
   *
   * 따라서 강타입화는 `@IsObject()`를 **덧붙이는** 방식이어야 한다
   * (`@ValidateIf(...) @IsObject() @ValidateNested() @Type(() => PenaltyScoreDto)`).
   * 서비스 가드(`extractEndPenalties`)도 배열을 422로 거부하므로 이중 방어가 된다.
   */
  it('penalties가 배열이면 거부한다 — 이미 통과하는 방어이므로 강타입화 과정에서 잃으면 안 된다', async () => {
    const errors = await validateAs(GameScoreDto, { home: 1, away: 1, penalties: [] });

    expectFailedAtOrUnder(errors, 'penalties');
  });

  /**
   * `@IsOptional()`을 그대로 뒀다면 통과했을 값. 이 DTO를 공유하는 팀 매치
   * 레인에는 `extractEndPenalties` 같은 서비스 가드가 없어서, null이 통과하면
   * `validateGameResultInvariants`의 `validateScore`가 `penalties !== undefined`
   * 분기에서 `null.home`을 읽어 `GameContractError`가 아닌 TypeError(500)를 내거나,
   * 저장에 성공하면 `parseOfficialPenalties(null)`이 throw해 POISONED가 된다.
   */
  it('penalties가 null이면 거부한다', async () => {
    const errors = await validateAs(GameScoreDto, { home: 1, away: 1, penalties: null });

    expectFailedAtOrUnder(errors, 'penalties');
  });

  it('penalties를 아예 보내지 않으면 통과한다(짝 증거 — null과 undefined를 구분한다)', async () => {
    await expect(validateAs(GameScoreDto, { home: 1, away: 0 })).resolves.toEqual([]);
  });

  it('승자가 결정된 정상 승부차기 점수는 통과한다(짝 증거)', async () => {
    await expect(
      validateAs(GameScoreDto, { home: 1, away: 1, penalties: { home: 5, away: 4 } }),
    ).resolves.toEqual([]);
  });

  /**
   * 선축(`firstKickSideKey`)에도 `penalties` 자체와 **같은 함정**이 있다.
   *
   * `@IsOptional()`은 값이 `null`일 때도 검증 전체를 건너뛰므로 `firstKickSideKey: null`이
   * 위반 0건으로 통과한다. 그리고 이 DTO를 공유하는 **팀 매치 레인**
   * (`GamesService.createResultRevision`)은 `jsonInput(dto.score)`를 그대로 저장하므로 —
   * `extractEndPenalties`가 없는 경로다 — 그 null이 `score.penalties`에 실제로 박힌다.
   * 그러면 "선축 없음(키 부재)"과 "선축 null" 두 상태가 공존하게 되고, 그건 서버가
   * 애써 지키는 불변식("없으면 없는 것이 유일한 표현")을 DTO 입구로 되돌리는 것이다.
   */
  it('선축이 null이면 거부한다 — @IsOptional()이었다면 통과했을 값', async () => {
    const errors = await validateAs(GameScoreDto, {
      home: 1,
      away: 1,
      penalties: { home: 5, away: 4, firstKickSideKey: null },
    });

    expectFailedAtOrUnder(errors, 'penalties');
  });

  it.each([
    ['소문자', 'home'],
    ['공백 포함', 'AWAY '],
    ['사이드 id', 'side-home'],
  ])('선축이 %s이면 거부한다 — HOME/AWAY만 허용한다', async (_label, firstKickSideKey) => {
    const errors = await validateAs(GameScoreDto, {
      home: 1,
      away: 1,
      penalties: { home: 5, away: 4, firstKickSideKey },
    });

    expectFailedAtOrUnder(errors, 'penalties');
  });

  it('선축을 생략하면 통과한다(짝 증거 — null과 undefined를 구분한다)', async () => {
    await expect(
      validateAs(GameScoreDto, { home: 1, away: 1, penalties: { home: 5, away: 4 } }),
    ).resolves.toEqual([]);
  });

  /**
   * **선언이 곧 허용이다.** `main.ts`의 `whitelist + forbidNonWhitelisted`는
   * `@ValidateNested()`가 걸린 중첩 객체 안까지 적용되므로, `PenaltyScoreDto`에 이 키를
   * 적지 않았다면 선축을 실은 요청이 여분 키로 400이 된다(알파 실사고와 같은 부류).
   */
  it('선축 HOME/AWAY는 통과한다 — 중첩 whitelist를 뚫는 유일한 방법이 이 선언이다', async () => {
    await expect(
      validateAs(GameScoreDto, { home: 1, away: 1, penalties: { home: 5, away: 4, firstKickSideKey: 'AWAY' } }),
    ).resolves.toEqual([]);
  });
});
