import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { DevLoginDto } from './dto/dev-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { V1AuthUser } from './v1-auth-user';
import { V1AuthGuard } from './v1-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(V1AuthGuard)
  me(@CurrentUser() user: V1AuthUser) {
    return this.authService.me(user.id);
  }

  @Post('dev-login')
  devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto.email);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
