import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { RegisterPushDeviceDto } from './dto/push-device.dto';
import { PushDeviceService } from './push-device.service';

@Controller('notifications/push-devices')
@UseGuards(V1AuthGuard)
export class PushDeviceController {
  constructor(private readonly pushDeviceService: PushDeviceService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(@CurrentUser() user: V1AuthUser, @Body() dto: RegisterPushDeviceDto) {
    return this.pushDeviceService.register(user.id, dto);
  }

  @Delete(':installationId')
  @HttpCode(204)
  revoke(
    @CurrentUser() user: V1AuthUser,
    @Param('installationId', new ParseUUIDPipe()) installationId: string,
  ) {
    return this.pushDeviceService.revoke(user.id, installationId);
  }
}
