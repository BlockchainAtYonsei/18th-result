import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityQuery } from './activity.dto';
import { AddressParams, ProposalParams } from '../common/input';
@Controller('accounts/:address')
export class ActivityController {
  constructor(private readonly service: ActivityService) {}
  @Get('activities') list(
    @Param() params: AddressParams,
    @Query() query: ActivityQuery,
  ) {
    return this.service.list(params.address, query);
  }
  @Get('proposals/:proposalId/activities') proposal(
    @Param() params: ProposalParams,
    @Query() query: ActivityQuery,
  ) {
    return this.service.list(params.address, query, params.proposalId);
  }
}
