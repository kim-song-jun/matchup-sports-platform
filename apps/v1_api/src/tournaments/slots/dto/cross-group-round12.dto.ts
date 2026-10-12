import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CrossGroupRound12Dto {
  @IsString() @Matches(/^[a-f0-9]{64}$/)
  version!: string;

  @IsArray() @ArrayMinSize(15) @ArrayMaxSize(15) @ArrayUnique() @IsUUID('all', { each: true })
  rankPicks!: string[];

  @IsArray() @ArrayMinSize(15) @ArrayMaxSize(15) @ArrayUnique() @IsUUID('all', { each: true })
  rankingOrder!: string[];

  @IsArray() @ArrayMinSize(12) @ArrayMaxSize(12) @ArrayUnique() @IsUUID('all', { each: true })
  assignments!: string[];

  @IsString() @Length(1, 500) @Matches(/\S/)
  reason!: string;
}
