import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MATCH_STYLE_MAX_ITEMS } from '../team-match-conditions.constants';
import { MutateTeamMatchDto } from './mutate-team-match.dto';

/**
 * 경기 스타일(matchStyle) 다중선택 상한 검증. 사용자 확정 결정(3개, 상충 조합/배지 정리
 * 목적)이 실제로 서버 DTO 레벨에서 걸리는지 확인한다 — 프론트 MultiPresetChipSelector가
 * 3개 초과 선택을 막아도, 서버가 별도로 강제하지 않으면 우회 요청(자동화 스크립트 등)으로
 * 조용히 뚫릴 수 있다. MATCH_STYLE_MAX_ITEMS를 다시 늘리거나 @ArrayMaxSize 데코레이터를
 * 지우면 이 테스트가 깨진다.
 */
const basePayload = {
  hostTeamId: '11111111-1111-4111-8111-111111111111',
  sportId: '22222222-2222-4222-8222-222222222222',
  regionId: '33333333-3333-4333-8333-333333333333',
  title: '토요일 저녁 풋살 상대팀 구합니다',
  startsAt: '2026-09-01T18:00:00.000Z',
  manualPlaceName: '잠실 풋살파크 A구장',
};

describe('MutateTeamMatchDto matchStyle cap', () => {
  it('confirms the configured cap is 3, not the old 6', () => {
    expect(MATCH_STYLE_MAX_ITEMS).toBe(3);
  });

  it(`accepts exactly ${3} match style selections`, async () => {
    const dto = plainToInstance(MutateTeamMatchDto, {
      ...basePayload,
      matchStyle: ['친선', '매너 중시', '초보 환영'],
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).not.toContain('matchStyle');
  });

  it('rejects a 4th match style selection instead of silently truncating it', async () => {
    const dto = plainToInstance(MutateTeamMatchDto, {
      ...basePayload,
      matchStyle: ['친선', '매너 중시', '초보 환영', '교환매치'],
    });

    const errors = await validate(dto);
    const matchStyleError = errors.find((error) => error.property === 'matchStyle');

    expect(matchStyleError).toBeDefined();
    expect(matchStyleError?.constraints).toHaveProperty('arrayMaxSize');
  });

  it('accepts an empty or omitted match style (field stays optional)', async () => {
    const dto = plainToInstance(MutateTeamMatchDto, { ...basePayload });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).not.toContain('matchStyle');
  });
});
