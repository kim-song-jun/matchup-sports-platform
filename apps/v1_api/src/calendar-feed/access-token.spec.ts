import { issueAccessToken, parseAccessToken } from './access-token';

const SECRET = 's'.repeat(40);
const ID = '5b8d356d-f7c8-4a64-95b3-ebf54a3681fd';

describe('access-token', () => {
  it('만든 토큰은 같은 종류·비밀로 풀면 행 id 가 나온다', () => {
    expect(parseAccessToken(issueAccessToken(SECRET, 'calendar_feed', ID), SECRET, 'calendar_feed')).toBe(ID);
  });

  it('다른 종류·다른 비밀·고친 id 는 거절한다', () => {
    const token = issueAccessToken(SECRET, 'calendar_feed', ID);
    expect(parseAccessToken(token, SECRET, 'widget')).toBeNull();
    expect(parseAccessToken(token, 'x'.repeat(40), 'calendar_feed')).toBeNull();
    const other = '6b8d356d-f7c8-4a64-95b3-ebf54a3681fd';
    expect(parseAccessToken(`${other}.${token.split('.')[1]}`, SECRET, 'calendar_feed')).toBeNull();
  });

  it('모양이 깨진 값은 거절한다', () => {
    for (const bad of ['', '.', 'abc', `${ID}.`, `${ID}.short`, 'not-a-uuid.abc']) {
      expect(parseAccessToken(bad, SECRET, 'calendar_feed')).toBeNull();
    }
  });
});
