import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class RemoveMatchDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  id: string;

  @IsArray()
  @Type(() => String)
  @IsString({ each: true })
  @IsNotEmpty()
  @ApiProperty()
  matchIds: string[];
}
