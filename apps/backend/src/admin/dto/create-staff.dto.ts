import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator'

export const STAFF_ROLES = ['OPERATOR', 'ATTENDANT', 'MANAGER'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string

  @IsIn(STAFF_ROLES)
  role!: StaffRole
}
