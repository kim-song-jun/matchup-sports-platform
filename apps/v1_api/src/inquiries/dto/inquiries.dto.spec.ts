import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInquiryDto } from './inquiries.dto';

describe('CreateInquiryDto', () => {
  it('accepts relatedType=team_contact (Phase 1 added the enum value; the DTO allowlist must follow)', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      category: 'report',
      title: 'Blocked team keeps messaging us',
      body: 'They keep sending contact requests after we blocked them.',
      relatedType: 'team_contact',
      relatedId: 'team-contact-1',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'relatedType')).toBe(false);
  });

  it('accepts a valid reportReason value', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      category: 'report',
      title: 'Spam contact requests',
      body: 'This team keeps spamming us.',
      reportReason: 'spam',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'reportReason')).toBe(false);
  });

  it('rejects an unknown reportReason value', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      category: 'report',
      title: 'Spam contact requests',
      body: 'This team keeps spamming us.',
      reportReason: 'not_a_real_reason',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'reportReason')).toBe(true);
  });
});
