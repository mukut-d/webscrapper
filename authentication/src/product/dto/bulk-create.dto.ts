import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class BulkCreate {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  file_path: string;

  @IsBoolean()
  @ApiProperty()
  @Transform(({ value }) => value === true)
  competitor: boolean;
}
