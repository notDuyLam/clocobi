import { SignJWT, jwtVerify } from 'jose';
import { ApiError } from '../common/api-error.js';

export const ACCESS_TTL = 15 * 60;
export const REFRESH_TTL = 7 * 24 * 60 * 60;

type SecretName = 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET';

function key(name: SecretName) {
  const secret = process.env[name];
  if (!secret) throw new Error(`${name} is not set`);
  return new TextEncoder().encode(secret);
}

export function signToken(userId: string, name: SecretName, ttl: number) {
  return new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key(name));
}

// Returns the user id, or throws 401 UNAUTHENTICATED for a missing, invalid or expired token.
export async function verifyToken(token: string | undefined, name: SecretName) {
  const secret = key(name);
  try {
    const { payload } = await jwtVerify(token ?? '', secret, {
      algorithms: ['HS256'],
    });
    if (payload.sub) return payload.sub;
  } catch {
    // fall through
  }
  throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in again.');
}
