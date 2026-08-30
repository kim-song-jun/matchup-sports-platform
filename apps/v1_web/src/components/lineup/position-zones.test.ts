import { describe, expect, it } from 'vitest';
import { buildPositionZones, shouldUseZoneLayout } from './position-zones';

/**
 * [D14] 띠 순서는 **프리셋에서 파생**한다 — 이 파일에 순서를 다시 적지 않는 것이 계약이다.
 * 순서를 두 곳에 적으면 프리셋이 바뀔 때 화면이 조용히 어긋나고, 그건 아무 오류도 안 내며
 * 사용자가 엉뚱한 자리를 고르게 만든다.
 *
 * 그리고 이 띠는 **경기 대형이 아니다.** `FOOTBALL_FORMATIONS` 의 빈 배열이 거부한 것은
 * 경기 규칙으로서의 좌표이고, 여기는 프로필에서 자리를 고르기 위한 UI 영역이다.
 * 좌표를 만들지 않는다는 것을 `rowIndex`(순서만)로 표현한다 — 픽셀은 컴포넌트가 계산한다.
 */
const FOOTBALL = [
  { code: 'GK', label: '골키퍼', goalkeeper: true },
  { code: 'DF', label: '수비수' },
  { code: 'MF', label: '미드필더' },
  { code: 'FW', label: '공격수' },
];

describe('[D14] buildPositionZones', () => {
  it('골키퍼가 맨 아래, 나머지는 공격이 위로 온다', () => {
    // 프리셋은 뒤(GK)에서 앞(FW) 순서이고 화면은 위가 공격이라 방향이 반대다.
    expect(buildPositionZones(FOOTBALL).map((zone) => zone.code)).toEqual(['FW', 'MF', 'DF', 'GK']);
  });

  it('rowIndex 는 0부터 이어진다 — 픽셀 좌표를 만들지 않는다', () => {
    // 좌표가 아니라 **순서**만 준다. 실제 위치는 컴포넌트가 개수로 나눠 계산하므로
    // 이 파일이 대형 좌표를 창작하는 일이 구조적으로 불가능하다.
    expect(buildPositionZones(FOOTBALL).map((zone) => zone.rowIndex)).toEqual([0, 1, 2, 3]);
  });

  it('프리셋 순서가 바뀌면 띠 순서도 따라간다 — 순서를 여기 적지 않는다', () => {
    const reordered = [
      { code: 'GK', label: '골키퍼', goalkeeper: true },
      { code: 'MF', label: '미드필더' },
      { code: 'DF', label: '수비수' },
    ];
    // DF·MF 를 바꿔 넣으면 결과도 바뀐다. 하드코딩돼 있었다면 이 테스트가 실패한다.
    expect(buildPositionZones(reordered).map((zone) => zone.code)).toEqual(['DF', 'MF', 'GK']);
  });

  it('골키퍼가 없는 종목도 정상이다', () => {
    const noKeeper = [
      { code: 'A', label: '가' },
      { code: 'B', label: '나' },
    ];
    expect(buildPositionZones(noKeeper).map((zone) => zone.code)).toEqual(['B', 'A']);
  });

  it('골키퍼가 둘 이상이어도 전부 맨 아래로 간다', () => {
    const twoKeepers = [
      { code: 'GK1', label: '골키퍼1', goalkeeper: true },
      { code: 'GK2', label: '골키퍼2', goalkeeper: true },
      { code: 'FW', label: '공격수' },
    ];
    const codes = buildPositionZones(twoKeepers).map((zone) => zone.code);
    expect(codes[0]).toBe('FW');
    expect(codes.slice(1)).toEqual(['GK1', 'GK2']);
  });

  it('빈 목록은 빈 결과다 — 포지션 개념이 없는 종목(러닝·수영)', () => {
    expect(buildPositionZones([])).toEqual([]);
  });
});

describe('[D14] shouldUseZoneLayout — 종목 이름이 아니라 데이터로 가른다', () => {
  it('대형이 없으면 띠로 그린다 (현재 축구)', () => {
    expect(shouldUseZoneLayout([])).toBe(true);
  });

  it('대형이 있으면 그 좌표를 쓴다 (풋살)', () => {
    expect(shouldUseZoneLayout([{ code: '1-2-1' }])).toBe(false);
  });

  it('나중에 축구 대형이 들어오면 코드 수정 없이 대형으로 전환된다', () => {
    // 이 테스트가 그 약속 자체다. 종목 이름으로 분기했다면 축구 대형이 생겨도
    // 여전히 띠를 그렸을 것이고, 아무도 그 사실을 모른 채 지나갔을 것이다.
    const footballOnceFormationsExist = [{ code: '4-4-2' }];
    expect(shouldUseZoneLayout(footballOnceFormationsExist)).toBe(false);
  });
});
