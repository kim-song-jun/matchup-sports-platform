import {
  ALPHA_SEED_LEAGUE_CONFIG_ID,
  ALPHA_SEED_STATUS_BY_LEAGUE_STATE,
} from '../../prisma/seed-alpha-league-qa';
import { FUTSAL_COMPETITION_CONFIG_ID } from './competition-config/competition-config-backfill';
import { STATUS_BY_LEAGUE_STATE, leagueMirrorCreateData } from './league-competition-mirror';

/**
 * **리그 QA 시드가 복제한 값이 원본과 같은가.**
 *
 * 시드는 API 프로덕션 이미지 안에서 도는데 그 이미지에는 `src/` 가 없어(`dist/`·`prisma/`·
 * `node_modules` 만 COPY) `../src/...` 를 import 할 수 없다 — 실제로 그 import 하나 때문에
 * 2026-08-09 배포가 MODULE_NOT_FOUND 로 죽었고, CI 는 `src/` 가 있는 레포에서 도느라 못 잡았다.
 *
 * 그래서 값을 복제하는데, **복제본은 조용히 어긋난다.** 어긋나면 시드가 리그와 다른 값을
 * 대회 거울에 박고, 그건 에러가 아니라 **두 축이 다른 값을 갖는 상태**로 남는다.
 * 대회 QA 시드가 config id 에 대해 이미 같은 가드를 갖는다(`seed-alpha-tournament-qa.spec.ts`).
 */
describe('리그 QA 시드의 복제값 고정', () => {
  it('status 매핑이 원본과 같다', () => {
    expect(ALPHA_SEED_STATUS_BY_LEAGUE_STATE.draft).toBe(STATUS_BY_LEAGUE_STATE.draft);
    expect(ALPHA_SEED_STATUS_BY_LEAGUE_STATE.active).toBe(STATUS_BY_LEAGUE_STATE.active);
    expect(ALPHA_SEED_STATUS_BY_LEAGUE_STATE.completed).toBe(STATUS_BY_LEAGUE_STATE.completed);
  });

  it('config id 가 레지스트리 상수와 같다', () => {
    expect(ALPHA_SEED_LEAGUE_CONFIG_ID).toBe(FUTSAL_COMPETITION_CONFIG_ID);
  });

  /**
   * **거울의 `createdAt` 은 원본 리그의 것이어야 한다.**
   *
   * 안 옮기면 `@default(now())` 가 **행을 만든 시각**(백필·시드 실행 시각)을 박는다. 그 값은
   * 아무 뜻도 없는데 **목록 정렬을 지배한다** — `orderBy: [{ createdAt: 'desc' }, ...]` 라서
   * 한 번에 만들어진 리그가 통째로 최신이 되어 통합 목록 첫 페이지를 다 차지한다.
   *
   * 2026-09-01 alpha 실측: 리그 50건이 전부 `2026-08-30T18:43:43`(백필 시각), 대회는 12일
   * 전 → `?kind=all` 첫 50건이 **전부 리그**였다. 화면에는 에러가 없고 "대회가 없네" 로만
   * 보인다. 그래서 값 자체를 여기서 못박는다.
   */
  it('거울의 createdAt 이 원본 리그의 것과 같다 — 기본값이 새면 목록 정렬이 뒤집힌다', () => {
    const originCreatedAt = new Date('2026-02-01T09:30:00.000Z');
    const data = leagueMirrorCreateData({
      id: 'lg-created-at',
      title: '리그',
      sportId: 'sport-1',
      regionId: 'region-1',
      state: 'active',
      startsOn: new Date('2026-03-01T00:00:00.000Z'),
      endsOn: new Date('2026-06-30T00:00:00.000Z'),
      seriesId: null,
      tier: null,
      seasonNo: null,
      sportCode: 'futsal',
      createdAt: originCreatedAt,
    });

    /* **`toEqual` 이다 — 참조 동일성은 계약이 아니다.**
       DB 에 쓰이는 것은 시각 값이므로, 헬퍼가 `new Date(원본)` 로 복사해 넣어도 결과가 같다.
       `toBe` 로 좁히면 **결함이 아닌 구현을 red 로 잡는다.**

       이 단언이 실제로 무엇을 잡는지 세어 봤다(2026-09-01 실측):
       ```
       createdAt 을 아예 안 넣음   → red   ← 진짜 결함(기본값 now() 가 박힌다)
       now() 를 넣음               → red   ← 진짜 결함
       new Date(원본)              → green ← 결함 아님. 여기만 toBe 와 갈린다
       ```
       앞의 둘이 이 스펙이 막으려는 것이고 둘 다 잡힌다. */
    expect(data.createdAt).toEqual(originCreatedAt);
  });

  it('시드가 만드는 거울의 필드 구성이 원본 헬퍼와 같다 — 키가 빠지면 잡힌다', () => {
    // 시드는 헬퍼를 못 부르므로 손으로 같은 모양을 만든다. **어떤 키를 만드는지**가
    // 갈라지면 거울에 빈 필드가 생기고, 그건 read-swap 뒤 화면에서만 드러난다.
    const fromHelper = leagueMirrorCreateData({
      id: 'lg-1',
      title: '리그',
      sportId: 'sport-1',
      regionId: 'region-1',
      state: 'active',
      startsOn: new Date('2026-03-01T00:00:00.000Z'),
      endsOn: new Date('2026-06-30T00:00:00.000Z'),
      seriesId: null,
      tier: null,
      seasonNo: null,
      sportCode: 'futsal',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    // 시드의 단발 리그 거울이 채우는 키(seriesId/tier/seasonNo 는 그 리그에 없어서 뺀다).
    const seedKeys = [
      'id',
      'kind',
      'sportId',
      'title',
      'status',
      'regionId',
      'scheduledAt',
      'scheduledEndAt',
      'competitionConfigVersionId',
      // 원본 리그의 생성 시각 — 안 옮기면 시드 실행 시각이 박혀 통합 목록 정렬을 지배한다.
      'createdAt',
    ];
    for (const key of seedKeys) {
      expect(Object.keys(fromHelper)).toContain(key);
    }
    // 헬퍼가 키를 새로 늘리면 시드도 따라와야 한다 — 여기서 개수로 걸린다.
    expect(Object.keys(fromHelper).sort()).toEqual(
      [...seedKeys, 'seriesId', 'tier', 'seasonNo'].sort(),
    );
  });
});
