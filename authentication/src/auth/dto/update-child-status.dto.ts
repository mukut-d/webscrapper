import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateChildStatusDto {
  @IsNotEmpty()
  parentUserId: string;

  @IsEmail()
  childEmail: string;

  @IsEnum(['active', 'inactive', 'email sent'])
  status: string;
}