import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { users } from '../db/schema.js'
import { EmailAlreadyInUse, UserNotFound } from '../errors/index.js'

const BCRYPT_ROUNDS = 12

export function createUserService(db: Db) {
  async function findByEmail(email: string) {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    return rows[0] ?? null
  }

  async function findById(id: string) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!rows[0]) throw new UserNotFound()
    return rows[0]
  }

  async function create(email: string, password: string, name: string) {
    const existing = await findByEmail(email)
    if (existing) throw new EmailAlreadyInUse()

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const rows = await db
      .insert(users)
      .values({ email, passwordHash, name })
      .returning()
    return rows[0]
  }

  async function updateProfile(
    userId: string,
    data: { name?: string; password?: string },
  ) {
    const updates: Record<string, unknown> = {}
    if (data.name) updates.name = data.name
    if (data.password)
      updates.passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS)

    const rows = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning()
    if (!rows[0]) throw new UserNotFound()
    return rows[0]
  }

  async function verifyPassword(hash: string, password: string) {
    return bcrypt.compare(password, hash)
  }

  return { findByEmail, findById, create, updateProfile, verifyPassword }
}
