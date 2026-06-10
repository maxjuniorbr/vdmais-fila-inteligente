import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class StaffLoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string
}
