import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
export function normalizeAddress(value: string): string {
  if (!ADDRESS.test(value))
    throw new BadRequestException('올바른 Ethereum 주소가 필요합니다.');
  return value.toLowerCase();
}
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
export const Lowercase = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  );
export class AddressParams {
  @Matches(ADDRESS) address!: string;
}
export class ProposalParams extends AddressParams {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^\S+$/)
  proposalId!: string;
}
