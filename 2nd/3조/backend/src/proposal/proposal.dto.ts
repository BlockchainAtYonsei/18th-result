import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TX_HASH, Trim, Lowercase } from '../common/input';
export class CreateProposalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^\S+$/)
  proposalId!: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(500) purpose!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) recipientLabel?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) memo?: string;
  @IsOptional() @Lowercase() @Matches(TX_HASH) creationTxHash?: string;
}
