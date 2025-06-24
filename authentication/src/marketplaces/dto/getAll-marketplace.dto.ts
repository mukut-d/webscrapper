import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class GetAllMarketPlaceDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @ApiProperty({ required: false })
  limit: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @ApiProperty({ required: false })
  offset: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  name: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  country: string;
}
