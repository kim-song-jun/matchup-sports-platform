import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateLeagueVenueDto } from './league-venue.dto';

async function errorsOf(body: object) {
  return (await validate(plainToInstance(UpdateLeagueVenueDto, body))).map((error) => error.property);
}

describe('UpdateLeagueVenueDto', () => {
  it.each([[{}], [{ venueAddress: '경기 성남시' }]])('venue 키가 없는 본문(%j)은 거부한다 — 빈 PATCH 가 기본 장소를 지우지 않게', async (body) => {
    expect(await errorsOf(body)).toContain('venue');
  });

  it.each([[{ venue: null }], [{ venue: '   ' }], [{ venue: '탄천 풋살장', venueAddress: '경기 성남시' }]])('venue 를 보낸 본문(%j)은 통과한다(null·공백은 지우기)', async (body) => {
    expect(await errorsOf(body)).toEqual([]);
  });
});
