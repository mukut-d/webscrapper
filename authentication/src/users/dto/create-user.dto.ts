import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
    message: 'password too weak',
  })
  password: string;

  @ApiProperty({required: false})
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({required: false})
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({required: false})
  @IsString()
  @IsOptional()
  phone?: string;
}