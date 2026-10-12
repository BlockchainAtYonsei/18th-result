import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../common/input';
export class PutProfileDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
}
