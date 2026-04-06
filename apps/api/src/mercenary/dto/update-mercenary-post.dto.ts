import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateMercenaryPostDto } from './create-mercenary-post.dto';

export class UpdateMercenaryPostDto extends PartialType(
  OmitType(CreateMercenaryPostDto, ['teamId'] as const),
) {}
