import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AccountService } from './account.service';
import {
  AccountQuery,
  CreateAccountDto,
  UpdateAccountDto,
} from './account.dto';
import { AddressParams } from '../common/input';
@Controller('accounts')
export class AccountController {
  constructor(private readonly service: AccountService) {}
  @Get() list(@Query() query: AccountQuery) {
    return this.service.list(query.owner);
  }
  @Post() create(@Body() dto: CreateAccountDto) {
    return this.service.create(dto);
  }
  @Get(':address') get(@Param() params: AddressParams) {
    return this.service.get(params.address);
  }
  @Patch(':address') update(
    @Param() params: AddressParams,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.service.update(params.address, dto);
  }
}
