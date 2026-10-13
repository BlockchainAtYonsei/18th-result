import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ADDRESS, TX_HASH, Trim, Lowercase } from '../common/input';
export class CreateAccountDto {
  @Matches(ADDRESS) address!: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @Matches(ADDRESS) creator!: string;
  @IsOptional() @Lowercase() @Matches(TX_HASH) creationTxHash?: string;
}
export class UpdateAccountDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
}
export class AccountQuery {
  @IsOptional() @Matches(ADDRESS) owner?: string;
}
