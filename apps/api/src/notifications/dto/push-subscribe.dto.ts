import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
  @ApiProperty({ description: 'Client ECDH public key (base64url)' })
  @IsString()
  p256dh!: string;

  @ApiProperty({ description: 'Client auth secret (base64url)' })
  @IsString()
  auth!: string;
}

export class PushSubscribeDto {
  @ApiProperty({ description: 'Push subscription endpoint URL' })
  @IsUrl()
  endpoint!: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class PushUnsubscribeDto {
  @ApiProperty({ description: 'Push subscription endpoint URL to remove' })
  @IsUrl()
  endpoint!: string;
}
