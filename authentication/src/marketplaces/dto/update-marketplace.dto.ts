import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';
import { CreateMarketplaceDto } from './create-marketplace.dto';

export class UpdateMarketplaceDto extends PartialType(CreateMarketplaceDto) {
  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  ISBNLimit: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  ASINLimit: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  keyWordSearchLimit: number;
}
