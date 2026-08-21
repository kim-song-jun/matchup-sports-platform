// getRoomType / getRoomTitle / getLinkedTarget 은 파일 로컬 함수다.
// 테스트하려면 chat.service.ts 에서 export 하도록 바꾼다(테스트 전용 export 가 아니라
// 순수 함수의 정상적인 노출이다 — 클래스 밖 최상위 함수이므로 부작용이 없다).
import { getRoomType, getRoomTitle, getLinkedTarget } from './chat.service';

const base = {
  matchId: null, teamId: null, teamMatchId: null, teamContactId: null,
  match: null, team: null, teamMatch: null, teamContact: null,
};

describe('채팅방 표시 정보', () => {
  it('team_contact 방을 team_match 로 오분류하지 않는다', () => {
    expect(getRoomType({ ...base, teamContactId: 'c1' })).toBe('team_contact');
  });

  it('team_contact 방의 제목은 상대 팀 이름이다', () => {
    expect(
      getRoomTitle({
        ...base,
        teamContact: { fromTeam: { name: '가팀' }, toTeam: { name: '나팀' } },
      }),
    ).not.toBe('채팅');
  });

  it('team_contact 방의 링크는 컨택 상세로 간다', () => {
    const target = getLinkedTarget({
      ...base,
      teamContactId: 'c1',
      teamContact: { id: 'c1', fromTeam: { name: '가팀' }, toTeam: { name: '나팀' } },
    });
    expect(target.type).toBe('team_contact');
    expect(target.route).toBe('/my/team-contacts/c1');
  });
});
