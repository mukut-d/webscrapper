import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class GetAllMatchDto {
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
  @IsIn([
    'title',
    'seller',
    'price',
    'discount',
    'description',
    'quantity',
    'category',
    'createdAt',
    'updatedAt',
    'asin',
    'isbn',
    'url',
  ])
  filterName: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  filterValue: string;

  @IsString()
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  @ApiProperty({ required: false })
  sortingType: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true)
  @ApiProperty({ required: false })
  isInStock: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true)
  @ApiProperty({ required: false })
  competitors: boolean;
}
