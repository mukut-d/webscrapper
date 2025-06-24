import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  ArrayMinSize,
} from 'class-validator';

export class CreateProjectDto {
  @IsNotEmpty()
  @ApiProperty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @ApiProperty()
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ default: false })
  description: string;

  @IsArray()
  @Type(() => String)
  @IsString({ each: true })
  @ApiProperty()
  @ArrayMinSize(1)
  marketplaces: string[];

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true)
  @ApiProperty({ required: false })
  variant: boolean;
}
