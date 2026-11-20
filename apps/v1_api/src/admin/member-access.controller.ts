import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { MEMBER_ACCESS_COOKIE } from '../auth/member-access-token';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { StartMemberAccessDto } from './dto/member-access.dto';
import { MemberAccessService } from './member-access.service';

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' });

// Authentication deliberately uses the original signed cookie inside the service, never the target identity or dev headers.
@Controller('admin')
export class MemberAccessController {
  constructor(private readonly access: MemberAccessService) {}

  @Post('users/:userId/member-access')
  @UseGuards(V1AuthGuard)
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async start(@Req() request: Request, @Res({ passthrough: true }) response: Response,
    @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: StartMemberAccessDto) {
    const { token, ...result } = await this.access.start(request, userId, dto.reason);
    // Retain the marker for the original session maximum lifetime (7 days), so grant expiry cannot silently restore administrator identity.
    response.cookie(MEMBER_ACCESS_COOKIE, token, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60_000 });
    return result;
  }

  @Get('member-access')
  @Header('Cache-Control', 'private, no-store')
  status(@Req() request: Request) { return this.access.status(request); }

  @Post('member-access/stop')
  @Header('Cache-Control', 'private, no-store')
  async stop(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.access.stop(request);
    response.clearCookie(MEMBER_ACCESS_COOKIE, cookieOptions());
    return result;
  }
}
