import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
function derive(value: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(value, salt, 32, (error, key) => (error ? reject(error) : resolve(key))),
  )
}
export class RoomError extends Error {}

export function requireRoom(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RoomError(code)
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function cleanText(value: unknown, min: number, max: number): string {
  requireRoom(typeof value === 'string' && !/[\p{Cc}\p{Cf}]/u.test(value), 'invalid')
  const clean = value.normalize('NFC').trim()
  requireRoom([...clean].length >= min && [...clean].length <= max, 'invalid')
  return clean
}

export function checkPassword(value: unknown): string {
  requireRoom(
    typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 128,
    'invalid',
  )
  return value
}

export interface PasswordDigest {
  salt: Buffer
  digest: Buffer
}

export async function hashPassword(value: string): Promise<PasswordDigest> {
  const salt = randomBytes(16)
  return { salt, digest: await derive(value, salt) }
}

export async function passwordMatches(value: string, saved: PasswordDigest) {
  const incoming = await derive(value, saved.salt)
  return timingSafeEqual(incoming, saved.digest)
}

/** Only keep attempts that still count toward this action's rolling window. */
export function takeLimit(windows: Map<string, number[]>, key: string, limit: number, ms: number) {
  const now = Date.now()
  const recent = (windows.get(key) ?? []).filter((stamp) => stamp > now - ms)
  requireRoom(recent.length < limit, 'rate_limited')
  recent.push(now)
  windows.set(key, recent)
}
