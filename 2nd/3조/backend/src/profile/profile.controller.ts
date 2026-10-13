import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { PutProfileDto } from './profile.dto';
import { AddressParams } from '../common/input';
@Controller('profiles')
export class ProfileController {
  constructor(private readonly service: ProfileService) {}
  @Get(':address') get(@Param() params: AddressParams) {
    return this.service.get(params.address);
  }
  @Put(':address') put(
    @Param() params: AddressParams,
    @Body() dto: PutProfileDto,
  ) {
    return this.service.put(params.address, dto);
  }
}
