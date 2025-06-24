import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class ExportProductDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  projectId: string;

  @IsArray()
  @IsNotEmpty()
  @ApiProperty()
  fields: string[];

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  type: string;
}
