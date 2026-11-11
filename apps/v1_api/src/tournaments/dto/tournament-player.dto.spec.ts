import { validateSync } from 'class-validator';
import {
  AddPlayerDto,
  CarryOverPlayerEligibilityDto,
  SelfDeclarePlayerEligibilityDto,
  UpdatePlayerEligibilityDto,
  UpdateTeamPlayerEligibilityDto,
} from './tournament-player.dto';

describe('AddPlayerDto — 골키퍼 입력 계약', () => {
  const dto = (goalkeeper: unknown) => Object.assign(new AddPlayerDto(), {
    userId: '10000000-0000-4000-8000-000000000001', realName: '테스트 선수', goalkeeper,
  });
  it.each([true, false, undefined])('%s를 허용한다', (value) => {
    expect(validateSync(dto(value), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
  it.each([null, 'true', 'false', 0, 1])('%s를 거부한다', (value) => {
    expect(validateSync(dto(value), { whitelist: true, forbidNonWhitelisted: true }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ property: 'goalkeeper' })]));
  });
});

// ─── MD-QA #192 ─────────────────────────────────────────────────────────────
const strict = { whitelist: true, forbidNonWhitelisted: true } as const;
const props = (errors: ReturnType<typeof validateSync>) => errors.map((error) => error.property);

describe('UpdatePlayerEligibilityDto — 판정 + 확인 방법 + 메모', () => {
  const dto = (body: Record<string, unknown>) => Object.assign(new UpdatePlayerEligibilityDto(), body);

  it.each(['joinkfa', 'certificate', 'self_presented', 'self_declared', 'other'])('확인 방법 %s 를 받는다', (method) => {
    expect(validateSync(dto({ eligibilityStatus: 'pro', verificationMethod: method, note: '메모' }), strict)).toEqual([]);
  });
  it('선출·아마추어 판정은 확인 방법이 필수다', () => {
    expect(props(validateSync(dto({ eligibilityStatus: 'non_pro' }), strict))).toContain('verificationMethod');
  });
  it('확인 중으로 되돌릴 때는 확인 방법 없이도 된다', () => {
    expect(validateSync(dto({ eligibilityStatus: 'needs_review' }), strict)).toEqual([]);
  });
  it('모르는 확인 방법·500자 넘는 메모는 거부한다', () => {
    expect(props(validateSync(dto({ eligibilityStatus: 'pro', verificationMethod: 'kfa_api' }), strict))).toContain('verificationMethod');
    expect(props(validateSync(dto({ eligibilityStatus: 'pro', verificationMethod: 'joinkfa', note: 'x'.repeat(501) }), strict))).toContain('note');
  });
  it('확인일·확인자는 요청으로 받지 않는다(서버가 채운다)', () => {
    expect(props(validateSync(dto({ eligibilityStatus: 'pro', verificationMethod: 'joinkfa', verifiedAt: '2026-11-11' }), strict))).toContain('verifiedAt');
  });
});

describe('UpdateTeamPlayerEligibilityDto — 팀장 경로는 판정 근거를 못 싣는다', () => {
  it('확인 방법·메모를 실으면 거부한다', () => {
    const body = Object.assign(new UpdateTeamPlayerEligibilityDto(), { eligibilityStatus: 'pro', verificationMethod: 'joinkfa', note: 'x' });
    expect(props(validateSync(body, strict))).toEqual(expect.arrayContaining(['verificationMethod', 'note']));
  });
});

describe('SelfDeclarePlayerEligibilityDto — 본인 신고', () => {
  const dto = (body: Record<string, unknown>) => Object.assign(new SelfDeclarePlayerEligibilityDto(), body);
  it('허위 신고 안내에 동의해야 한다', () => {
    expect(validateSync(dto({ selfDeclaredStatus: 'pro', consent: true }), strict)).toEqual([]);
    expect(props(validateSync(dto({ selfDeclaredStatus: 'pro', consent: false }), strict))).toContain('consent');
    expect(props(validateSync(dto({ selfDeclaredStatus: 'pro' }), strict))).toContain('consent');
    expect(props(validateSync(dto({ selfDeclaredStatus: 'pro', consent: 'true' }), strict))).toContain('consent');
  });
  it('확인 중은 신고값이 아니다', () => {
    expect(props(validateSync(dto({ selfDeclaredStatus: 'needs_review', consent: true }), strict))).toContain('selfDeclaredStatus');
  });
});

describe('CarryOverPlayerEligibilityDto', () => {
  it('원본 선수 id 는 UUID 다', () => {
    expect(validateSync(Object.assign(new CarryOverPlayerEligibilityDto(), { sourcePlayerId: '10000000-0000-4000-8000-000000000001' }), strict)).toEqual([]);
    expect(props(validateSync(Object.assign(new CarryOverPlayerEligibilityDto(), { sourcePlayerId: 'x' }), strict))).toContain('sourcePlayerId');
  });
});
