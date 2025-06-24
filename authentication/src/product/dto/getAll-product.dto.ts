import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class GetAllProductDto {
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
  search: string;

  @IsString()
  @ApiProperty()
  projectId: string;
}

export class GetAllSearchDto {
  @IsArray()
  @IsOptional()
  @ApiProperty({
    required: false,
    example: [
      {
        filterName: 'price',
        filterValue: [2000, 3000],
        filterCondition: 'Between',
      },
    ],
  })
  filter1list?: object[];

  @IsObject()
  @IsOptional()
  @ApiProperty({ required: false, example: { ByPrice: [1000, 2000] } })
  filter2Obj?: object;

  @IsString()
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  @ApiProperty({ required: false })
  sortingType?: string;
}
