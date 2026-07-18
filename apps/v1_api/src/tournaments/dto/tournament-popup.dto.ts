import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTournamentPopupDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
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
