import { IsIn } from 'class-validator';

export const UNLINKABLE_LOGIN_PROVIDERS = ['kakao', 'apple', 'email'] as const;

export type UnlinkableLoginProvider = (typeof UNLINKABLE_LOGIN_PROVIDERS)[number];

export class UnlinkLoginMethodDto {
  @IsIn(UNLINKABLE_LOGIN_PROVIDERS, { message: '해제할 로그인 수단을 골라 주세요.' })
  provider!: UnlinkableLoginProvider;
}
