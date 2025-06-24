import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUrl,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateMarketplaceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsUrl()
  @IsNotEmpty()
  @ApiProperty()
  url: string;

  @IsString()
  @IsUrl()
  @IsNotEmpty()
  @ApiProperty()
  logo: string;

  @IsString()
  @IsUrl()
  @IsNotEmpty()
  @ApiProperty()
  image: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  parentMarketplace: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  childMarketplace: string;

  @IsBoolean()
  @ApiProperty()
  @IsNotEmpty()
  ISBNAllowed: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  ISBNLimit: number;

  @IsBoolean()
  @IsNotEmpty()
  @ApiProperty()
  ASINAllowed: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  ASINLimit: number;

  @IsBoolean()
  @IsNotEmpty()
  @ApiProperty()
  keyWordSearchAllowed: boolean;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  keyWordSearchLimit: number;

  @IsBoolean()
  @IsNotEmpty()
  @ApiProperty()
  privateDomainAllowed: boolean;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  name: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  maxByDefault: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  perfomanceCalculationType: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  performanceInputType: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  performanceHelpText: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  isVisibleOnNewLaunch: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  isVisibleOnCatalogPush: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  visibleTo: string;
}
