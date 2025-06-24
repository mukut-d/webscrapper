import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAlertDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  name: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'd8810d23-de12-414a-91ea-42aac2473f85' })
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'price',
    examples: ['price', 'bestsellerrank', 'significant_decrease'],
  })
  alertOn: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'LESSTHAN',
  })
  condition: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'month',
  })
  @IsIn(['month', 'week', '3 hour', '6 hour', '12 hour', '1 day'])
  duration: string;

  @IsArray()
  @ArrayMinSize(1)
  @ApiProperty({
    example: [100],
  })
  value: number[];
}
