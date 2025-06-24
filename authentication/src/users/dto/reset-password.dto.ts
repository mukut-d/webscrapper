import { IsString, IsNotEmpty } from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty()
  readonly id: number;

  @IsString()
  readonly password: string;
}