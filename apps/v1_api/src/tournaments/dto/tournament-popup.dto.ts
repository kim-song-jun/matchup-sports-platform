import { IsDateString, IsIn, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class CreateTournamentPopupDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  @IsIn(['draft', 'published', 'archived'])
  status!: 'draft' | 'published' | 'archived';

  @IsOptional()
  @IsDateString()
  displayStartAt?: string | null;

  @IsOptional()
  @IsDateString()
  displayEndAt?: string | null;
}

export class UpdateTournamentPopupDto extends CreateTournamentPopupDto {}
