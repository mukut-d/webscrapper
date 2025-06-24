import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class subDto {
  @IsNumber()
  categoryId: number;

  @IsString()
  category_full: string;
}
export class UpdateUserPasswordDto extends PartialType(CreateUserDto) {
  // @ApiProperty()
  // @IsNotEmpty()
  // @IsString()
  // @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
  //   message: 'password too weak',
  // })
  // password: string;

  @ApiProperty({
    example: [
      {
        categoryId: 167,
        category_full: 'Apparel & Accessories > Clothing Accessories',
      },
    ],
  })
  @IsArray()
  @Type(() => subDto)
  @ValidateNested()
  category: subDto[];
}

export class UpdateUserEmailDto extends PartialType(CreateUserDto) {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  email: string;
}
