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
