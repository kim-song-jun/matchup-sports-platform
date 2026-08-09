import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { POPUP_TARGET_SCREENS, PopupTargetScreen } from '../popup-screen';

export class ActivePopupQueryDto {
  @IsIn(POPUP_TARGET_SCREENS)
  screen!: PopupTargetScreen;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^\/(?!\/)(?!admin(?:\/|$))[^\\\s?#]*$/)
  path?: string;
}
