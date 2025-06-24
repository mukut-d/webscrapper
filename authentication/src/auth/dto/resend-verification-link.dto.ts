import { IsEmail } from 'class-validator';

export class ResendVerificationLinkDto {
  @IsEmail()
  email: string;

  @IsEmail()
  parentEmail: string;
}