import { buildPushAudienceWhere, pushAudienceGenderWhere } from './admin-push-audience';

describe('admin-push-audience', () => {
  const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';

  it('성별을 고르지 않으면 성별 조건을 걸지 않는다', () => {
    expect(pushAudienceGenderWhere()).toEqual({});
    expect(buildPushAudienceWhere({ target: 'broadcast' })).toEqual({ accountStatus: 'active' });
  });

  it('성별을 고르면 그 성별 또는 성별 미입력(프로필 없음·빈 값·male/female 이 아닌 값)이다', () => {
    expect(pushAudienceGenderWhere('male')).toEqual({
      OR: [
        { profile: { is: { gender: 'male' } } },
        { profile: { is: null } },
        { profile: { is: { gender: null } } },
        { profile: { is: { gender: { notIn: ['male', 'female'] } } } },
      ],
    });
  });

  it('대회·리그 대상은 참가 확정 팀의 활성 팀원으로 좁히고, 삭제·정지·보관된 팀은 뺀다', () => {
    const where = buildPushAudienceWhere({ target: 'competition', competitionId: COMPETITION_ID });
    expect(where).toEqual({
      AND: [
        { accountStatus: 'active' },
        { teamMemberships: { some: { status: 'active', team: { status: 'active', deletedAt: null, tournamentRegistrations: { some: { tournamentId: COMPETITION_ID, status: 'confirmed' } } } } } },
      ],
    });
  });

  it('대회·리그 + 성별은 세 조건이 모두 AND 로 묶인다', () => {
    const where = buildPushAudienceWhere({ target: 'competition', competitionId: COMPETITION_ID, gender: 'female' });
    expect((where as { AND: unknown[] }).AND).toHaveLength(3);
  });

  it('대회·리그 대상인데 id 가 없으면 전체로 번지지 않고 예외를 던진다', () => {
    expect(() => buildPushAudienceWhere({ target: 'competition' })).toThrow();
  });
});
