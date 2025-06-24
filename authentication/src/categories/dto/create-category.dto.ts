import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateCategoryDto {
  @IsNumber()
  @IsNotEmpty()
  @ApiProperty({ required: true })
  id: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ required: true })
  category: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  parent_id: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  parent_category: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ required: true })
  category_full: string;
}
