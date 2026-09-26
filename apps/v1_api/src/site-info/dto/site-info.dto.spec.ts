import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSiteInfoDto } from './site-info.dto';

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(UpdateSiteInfoDto, body));
  return errors.map((error) => error.property);
}

describe('UpdateSiteInfoDto', () => {
  it('accepts a full valid body and an empty body (partial update)', async () => {
    expect(
      await errorsFor({
        companyName: '팀밋',
        representativeName: '대표',
        businessRegistrationNumber: '123-45-67890',
        address: '서울',
        mailOrderSalesNumber: '제2026-서울-0000호',
        contactEmail: 'help@example.com',
        guestInquiryRetention: '문의 처리 완료 후 1년',
      }),
    ).toEqual([]);
    expect(await errorsFor({})).toEqual([]);
  });

  it.each(['1234567890', '123-456-7890', '12-345-67890', 'abc-de-fghij'])(
    'rejects business registration number %s',
    async (value) => {
      expect(await errorsFor({ businessRegistrationNumber: value })).toEqual(['businessRegistrationNumber']);
    },
  );

  it('trims before checking the business number format', async () => {
    expect(await errorsFor({ businessRegistrationNumber: ' 123-45-67890 ' })).toEqual([]);
  });

  it('rejects a malformed email', async () => {
    expect(await errorsFor({ contactEmail: 'not-an-email' })).toEqual(['contactEmail']);
  });

  it('empty string clears format-checked fields without tripping the format rule', async () => {
    expect(await errorsFor({ businessRegistrationNumber: '', contactEmail: '' })).toEqual([]);
  });

  it.each([
    ['companyName', 101],
    ['representativeName', 51],
    ['address', 201],
    ['mailOrderSalesNumber', 51],
    ['guestInquiryRetention', 101],
  ])('rejects %s longer than its limit', async (field, length) => {
    expect(await errorsFor({ [field]: 'a'.repeat(length) })).toEqual([field]);
    expect(await errorsFor({ [field]: 'a'.repeat(length - 1) })).toEqual([]);
  });

  it('rejects non-string values', async () => {
    expect(await errorsFor({ companyName: 123 })).toEqual(['companyName']);
  });
});
