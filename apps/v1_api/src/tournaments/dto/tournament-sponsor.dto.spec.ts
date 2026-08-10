import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTournamentSponsorDto, UpdateTournamentSponsorDto } from './tournament-sponsor.dto';

describe('tournament sponsor DTOs', () => {
  it('accepts the root-relative logo URL returned by the upload API on create', async () => {
    const dto = plainToInstance(CreateTournamentSponsorDto, {
      name: '서울 스포츠랩',
      logoUrl: '/uploads/2026/08/sportslab.webp',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('allows blank optional URL fields so edit forms can clear them', async () => {
    const dto = plainToInstance(UpdateTournamentSponsorDto, {
      name: '서울 스포츠랩',
      logoUrl: '',
      websiteUrl: '',
      instagramUrl: '',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects malformed non-empty URL fields', async () => {
    const dto = plainToInstance(UpdateTournamentSponsorDto, {
      logoUrl: 'sportslab.example.com/logo.png',
    });

    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'logoUrl')).toBeDefined();
  });

  it('rejects traversal in a root-relative upload logo path', async () => {
    const dto = plainToInstance(CreateTournamentSponsorDto, {
      name: '서울 스포츠랩',
      logoUrl: '/uploads/../private/logo.webp',
    });

    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'logoUrl')).toBeDefined();
  });
});
