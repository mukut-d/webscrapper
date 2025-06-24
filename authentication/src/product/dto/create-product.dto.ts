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

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '453baa28-fce2-4c9f-a06a-2dd274dc5470' })
  projectId: string;

  @IsArray()
  @IsOptional()
  @ApiProperty({
    example: [
      {
        domain: 'amazon.in',
        query_type: 'asin',
        query: 'B09JGL4CN5',
        variants: false,
        limit: 1,
      },
      {
        domain: 'flipkart.com',
        query_type: 'keyword',
        query: 'Whiskas Wet Cat Food',
        variants: true,
        limit: 15,
      },
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
        id: 1,
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
