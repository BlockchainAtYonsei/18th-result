import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProposalService } from './proposal.service';
import { CreateProposalDto } from './proposal.dto';
import { AddressParams, ProposalParams } from '../common/input';
@Controller('accounts/:address/proposals')
export class ProposalController {
  constructor(private readonly service: ProposalService) {}
  @Get() list(@Param() params: AddressParams) {
    return this.service.list(params.address);
  }
  @Post() create(
    @Param() params: AddressParams,
    @Body() dto: CreateProposalDto,
  ) {
    return this.service.create(params.address, dto);
  }
  @Get(':proposalId') get(@Param() params: ProposalParams) {
    return this.service.get(params.address, params.proposalId);
  }
  @Get(':proposalId/security') security(@Param() params: ProposalParams) {
    return this.service.security(params.address, params.proposalId);
  }
}
