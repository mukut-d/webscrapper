import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateMatchDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'a2ab9e83-6f5d-4182-b400-96f658512c03' })
  productId: string;

  @IsArray()
  @IsOptional()
  @ApiProperty({
    example: [
      {
        domain: 'amazon.in',
        query_type: 'isbn',
        query: '1905605390',
        variants: true,
        limit: 15,
      },
      {
        domain: 'amazon.in',
        query_type: 'category',
        query: 'Pet Supplies',
        variants: false,
        id: 3367,
      },
    ],
  })
  domains: subDto[];

  @IsBoolean()
  @ApiProperty()
  @Transform(({ value }) => value === true)
  variants: boolean;

  @IsBoolean()
  @ApiProperty()
  @Transform(({ value }) => value === true)
  competitor: boolean;
}

export class subDto {
  @IsString()
  @ApiProperty()
  domain: string;

  @IsString()
  @ApiProperty()
  query_type: string;

  @IsString()
  @ApiProperty()
  query: string;

  @IsNumber()
  @ApiProperty()
  @IsOptional()
  id: number;

  @IsBoolean()
  @ApiProperty()
  @Transform(({ value }) => value === true)
  variants: boolean;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit: number;
}
