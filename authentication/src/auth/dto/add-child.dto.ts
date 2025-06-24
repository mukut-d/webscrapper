import { IsEmail, IsNotEmpty } from 'class-validator';

export class AddChildDto {
  @IsEmail()
  @IsNotEmpty()
  readonly email: string;

  @IsNotEmpty()
  readonly parentUserId: string;
}