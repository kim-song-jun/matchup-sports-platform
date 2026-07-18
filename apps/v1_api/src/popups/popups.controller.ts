import { Controller, Get, Query } from '@nestjs/common';
import { ActivePopupQueryDto } from './dto/active-popup-query.dto';
import { PopupsService } from './popups.service';

@Controller('popups')
export class PopupsController {
  constructor(private readonly popupsService: PopupsService) {}

  @Get('active')
  async getActive(@Query() query: ActivePopupQueryDto) {
    return { popup: await this.popupsService.findActive(query.screen) };
  }
}
