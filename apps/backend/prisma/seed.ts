/**
 * Bootstrap seed: creates the initial global ADMIN account so the
 * onboarding flow (/admin) can be used on a fresh database.
 *
 * Required env vars: ADMIN_EMAIL, ADMIN_PASSWORD (min 8 chars).
 * Optional: ADMIN_NAME (defaults to "Administrador").
 *
 * Idempotent: does nothing if an ADMIN account already exists.
 */
import 'dotenv/config'
import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const BCRYPT_ROUNDS = 12

async function main() {
  const prisma = new PrismaClient()
  try {
    const existing = await prisma.operator.findFirst({ where: { role: Role.ADMIN } })
    if (existing) {
      console.log(`Admin already exists (${existing.email}). Nothing to do.`)
      return
    }

    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    const password = process.env.ADMIN_PASSWORD
    const name = process.env.ADMIN_NAME?.trim() || 'Administrador'

    if (!email || !password) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD env vars are required to seed the admin')
    }
    if (password.length < 8) {
      throw new Error('ADMIN_PASSWORD must have at least 8 characters')
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const admin = await prisma.operator.create({
      data: { name, email, passwordHash, role: Role.ADMIN },
    })
    console.log(`Admin created: ${admin.email}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
