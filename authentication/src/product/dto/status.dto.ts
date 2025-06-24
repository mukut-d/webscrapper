import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class StatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['started', 'completed'])
  @ApiProperty()
  status: string;
}
