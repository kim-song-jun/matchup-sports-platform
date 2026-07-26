import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTournamentSponsorDto } from './tournament-sponsor.dto';

describe('UpdateTournamentSponsorDto', () => {
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
});
