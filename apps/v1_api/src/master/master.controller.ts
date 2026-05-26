import { Body, Controller, Get, Post } from '@nestjs/common';
import { ResolveLocationDto } from './dto/resolve-location.dto';
import { MasterService } from './master.service';

@Controller('master')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  @Get('sports')
  getSports() {
    return this.masterService.getSports();
  }

  @Get('regions')
  getRegions() {
    return this.masterService.getRegions();
  }

  @Post('regions/resolve-location')
  resolveLocation(@Body() dto: ResolveLocationDto) {
    return this.masterService.resolveLocation(dto);
  }
}
