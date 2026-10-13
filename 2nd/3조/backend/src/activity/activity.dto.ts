import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export class ActivityQuery {
  @IsOptional()
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  @MaxLength(19)
  cursor?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 20;
}
