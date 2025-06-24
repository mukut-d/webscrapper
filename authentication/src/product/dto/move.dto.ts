import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsBoolean, IsArray } from 'class-validator';

export class MoveDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  currentProjectId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  newProjectId: string;

  @IsArray()
  @IsNotEmpty()
  @ApiProperty()
  productIdList: string[];

  @IsBoolean()
  @IsNotEmpty()
  @Transform(({ value }) => value === true)
  @ApiProperty()
  moveflag: boolean;
}
