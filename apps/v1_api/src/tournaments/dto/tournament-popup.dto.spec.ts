import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTournamentPopupDto, UpdateTournamentPopupDto } from './tournament-popup.dto';

const VALID_POPUP_INPUT = {
  title: '대회 운영 안내',
  body: '경기 시작 30분 전까지 체크인해 주세요.',
  status: 'published' as const,
};

describe('Tournament popup DTOs', () => {
  it.each([
    ['title', { ...VALID_POPUP_INPUT, title: '   \t\n' }],
    ['body', { ...VALID_POPUP_INPUT, body: '   \t\n' }],
  ])('rejects whitespace-only %s content after normalization', async (property, input) => {
    const dto = plainToInstance(CreateTournamentPopupDto, input);
    const errors = await validate(dto);

    expect(dto[property as 'title' | 'body']).toBe('');
    expect(errors.find((error) => error.property === property)?.constraints).toHaveProperty('isNotEmpty');
  });

  it('accepts meaningful content and exposes its trimmed values to the service', async () => {
    const dto = plainToInstance(UpdateTournamentPopupDto, {
      ...VALID_POPUP_INPUT,
      title: '  대회 운영 안내  ',
      body: '\n 경기 시작 30분 전까지 체크인해 주세요. \t',
      imageUrl: '',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.title).toBe('대회 운영 안내');
    expect(dto.body).toBe('경기 시작 30분 전까지 체크인해 주세요.');
    expect(dto.imageUrl).toBe('');
  });
});
