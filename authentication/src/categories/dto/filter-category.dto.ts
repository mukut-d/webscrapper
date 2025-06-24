import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FilterCategory {
  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  id: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  keyword: string;
}
