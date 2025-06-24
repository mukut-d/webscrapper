import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
export class GetAllProjectDto {
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
  @IsIn(['name', 'description', 'createdAt', 'updatedAt'])
  filterName: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  filterValue: string;

  @IsString()
  @IsIn(['ASC', 'DESC'])
  @IsOptional()
  @ApiProperty({ required: false })
  sortingType: string;
}
