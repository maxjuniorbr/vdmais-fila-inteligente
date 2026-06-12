import { EntryChannel, Role } from '@prisma/client'

export interface AuthenticatedUser {
  userId: string
  role: Role
  erId?: string
  entryChannel?: EntryChannel
}
