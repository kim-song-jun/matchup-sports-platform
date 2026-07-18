import { IsIn } from 'class-validator';
import { POPUP_TARGET_SCREENS, PopupTargetScreen } from '../popup-screen';

export class ActivePopupQueryDto {
  @IsIn(POPUP_TARGET_SCREENS)
  screen!: PopupTargetScreen;
}
