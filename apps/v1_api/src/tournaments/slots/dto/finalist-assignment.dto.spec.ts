import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FinalistAssignmentDto } from './finalist-assignment.dto';
const valid = () => ({ version: 'a'.repeat(64), reason: '진출팀 확인', assignments: [{ fixtureId: '11111111-1111-4111-8111-111111111111', side: 'HOME', registrationId: '22222222-2222-4222-8222-222222222222' }] });
const errors = (body: unknown) => validate(plainToInstance(FinalistAssignmentDto, body), { whitelist: true, forbidNonWhitelisted: true });
describe('FinalistAssignmentDto', () => {
  it('version/사유/중첩 자리 요청을 허용한다', async () => { expect(await errors(valid())).toEqual([]); });
  it.each([
    { ...valid(), reason: '  ' }, { ...valid(), version: 'old' }, { ...valid(), assignments: [] },
    { ...valid(), assignments: [{ ...valid().assignments[0], side: 'OTHER' }] },
    { ...valid(), assignments: [{ ...valid().assignments[0], registrationId: 'foreign' }] },
    { ...valid(), assignments: [{ ...valid().assignments[0], sourceGroupId: 'unexpected' }] },
    { ...valid(), uiOnly: true },
  ])('잘못된 DTO와 UI 전용 추가 필드를 차단한다: %j', async (body) => { expect((await errors(body)).length).toBeGreaterThan(0); });
});
