import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TeamsQueryDto } from './teams-query.dto';

function sortErrors(sort: string) {
  const dto = plainToInstance(TeamsQueryDto, { sort });
  return validateSync(dto).filter((error) => error.property === 'sort');
}

describe('TeamsQueryDto.sort', () => {
  it.each(['latest', 'member_count', 'activity'])('실제로 순서가 다른 정렬(%s)을 받는다', (sort) => {
    expect(sortErrors(sort)).toHaveLength(0);
  });

  // 서버에 분기가 없어 등록순과 같은 결과였던 값은 허용값에서 뺀다 — 받아 놓고 조용히 등록순으로 돌려주면 거짓 정렬이다.
  it.each(['recommended', 'trust', 'deadline'])('같은 결과를 내던 값(%s)은 거부한다', (sort) => {
    expect(sortErrors(sort)).toHaveLength(1);
  });
});
