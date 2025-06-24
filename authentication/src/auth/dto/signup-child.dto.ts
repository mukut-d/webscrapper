import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class SignupChildDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  token: string;

  firstName?: string;

  lastName?: string;
}