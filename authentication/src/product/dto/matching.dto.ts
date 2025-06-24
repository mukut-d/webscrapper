import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsArray, IsIn } from 'class-validator';

export class MatchDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  id: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['title', 'productId', 'category', 'url'])
  @ApiProperty()
  creationType: string;

  @IsArray()
  @Type(() => String)
  @IsString({ each: true })
  @IsNotEmpty()
  @ApiProperty()
  value: string[];
}
