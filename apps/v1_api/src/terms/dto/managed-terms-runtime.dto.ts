import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsUUID } from 'class-validator';

export class CurrentManagedTermsQueryDto {
  @IsIn(['signup', 'tournament_application', 'footer'])
  context: 'signup' | 'tournament_application' | 'footer' = 'signup';
}

export class AcceptManagedTermsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  documentIds!: string[];
}
