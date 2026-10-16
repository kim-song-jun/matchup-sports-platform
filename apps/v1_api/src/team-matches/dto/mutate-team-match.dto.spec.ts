import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MATCH_STYLE_MAX_ITEMS } from '../team-match-conditions.constants';
import { MutateTeamMatchDto, UpdateTeamMatchDto } from './mutate-team-match.dto';
import { CreateAdminTeamMatchRecruitmentDto, UpdateAdminTeamMatchRecruitmentDto } from './admin-team-match-recruitment.dto';

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
  it.each([MutateTeamMatchDto, CreateAdminTeamMatchRecruitmentDto])('accepts both image fields through the real DTO whitelist (%p)', async (Dto) => {
    const { hostTeamId, ...shared } = basePayload;
    const required = Dto === MutateTeamMatchDto ? { hostTeamId } : { clientCommandId: hostTeamId };
    const dto = plainToInstance(Dto as typeof MutateTeamMatchDto, {
      ...shared, ...required, imageUrl: '/uploads/wide.webp', listImageUrl: '/uploads/square.webp',
    });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    const invalid = plainToInstance(Dto as typeof MutateTeamMatchDto, { ...shared, ...required, listImageUrl: 123 });
    expect((await validate(invalid)).find((error) => error.property === 'listImageUrl')?.constraints).toHaveProperty('isString');
  });

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

  it('accepts the stable master region catalog id used by the v1 API', async () => {
    const dto = plainToInstance(MutateTeamMatchDto, {
      ...basePayload,
      regionId: 'region-seoul-jongno',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).not.toContain('regionId');
  });

  it('rejects an empty required region id at the DTO boundary', async () => {
    const dto = plainToInstance(MutateTeamMatchDto, { ...basePayload, regionId: '' });

    const errors = await validate(dto);
    const regionIdError = errors.find((error) => error.property === 'regionId');

    expect(regionIdError?.constraints).toHaveProperty('isNotEmpty');
  });
});

/**
 * MD-QA #163 — 개인 매치와 같은 경계 결함. 웹 폼(사용자·어드민)은 title.trim() 으로
 * 막지만 서버는 빈 제목(사용자 DTO)·공백 제목(두 DTO 모두)을 받아 alpha 에 제목 없는
 * 팀매치가 201 로 생성됐다. 사용자 생성·수정과 어드민 모집 생성·수정이 같은 규칙을 써야 한다.
 */
describe('team match title', () => {
  const { hostTeamId, ...shared } = basePayload;
  const cases = [
    ['MutateTeamMatchDto', MutateTeamMatchDto, { ...shared, hostTeamId }],
    ['UpdateTeamMatchDto', UpdateTeamMatchDto, { ...shared, hostTeamId, version: '2026-10-16T00:00:00.000Z' }],
    ['CreateAdminTeamMatchRecruitmentDto', CreateAdminTeamMatchRecruitmentDto, { ...shared, clientCommandId: hostTeamId }],
    ['UpdateAdminTeamMatchRecruitmentDto', UpdateAdminTeamMatchRecruitmentDto, { ...shared, clientCommandId: hostTeamId, version: '2026-10-16T00:00:00.000Z' }],
  ] as const;

  it.each(cases.flatMap(([name, Dto, payload]) => [
    [name, 'empty', Dto, payload, ''],
    [name, 'whitespace only', Dto, payload, '   '],
  ] as const))('%s rejects a %s title', async (_name, _label, Dto, payload, title) => {
    const errors = await validate(plainToInstance(Dto as typeof MutateTeamMatchDto, { ...payload, title }));
    expect(errors.some((error) => error.property === 'title')).toBe(true);
  });

  it.each(cases)('%s trims surrounding whitespace from the title', async (_name, Dto, payload) => {
    const dto = plainToInstance(Dto as typeof MutateTeamMatchDto, { ...payload, title: '  토요일 풋살  ' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'title')).toBe(false);
    expect(dto.title).toBe('토요일 풋살');
  });
});
