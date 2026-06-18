import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ConfirmVerificationDto, RequestPhoneVerificationDto } from './dto/verification.dto';
import { VerificationService } from './verification.service';

@Controller('verification')
@UseGuards(V1AuthGuard)
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('email/request')
  @HttpCode(200)
  requestEmail(@CurrentUser() user: V1AuthUser) {
    return this.verificationService.requestEmail(user);
  }

  @Post('email/confirm')
  @HttpCode(200)
  confirmEmail(@CurrentUser() user: V1AuthUser, @Body() dto: ConfirmVerificationDto) {
    return this.verificationService.confirm(user, 'email', dto.code);
  }

  @Post('phone/request')
  @HttpCode(200)
  requestPhone(@CurrentUser() user: V1AuthUser, @Body() dto: RequestPhoneVerificationDto) {
    return this.verificationService.requestPhone(user, dto.phone);
  }

  @Post('phone/confirm')
  @HttpCode(200)
  confirmPhone(@CurrentUser() user: V1AuthUser, @Body() dto: ConfirmVerificationDto) {
    return this.verificationService.confirm(user, 'phone', dto.code);
  }
}
