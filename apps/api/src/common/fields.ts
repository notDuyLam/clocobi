import { z } from 'zod';
import { ApiError } from './api-error.js';

// Omitted, null or "" (after trim) becomes null (API section 2).
export const blankToNull = (s: unknown) =>
  s == null || (typeof s === 'string' && s.trim() === '') ? null : s;
export const optionalText = (max: number, lower = false) =>
  z.preprocess(
    blankToNull,
    (lower ? z.string().trim().toLowerCase() : z.string().trim())
      .max(max)
      .nullable(),
  );
export const optionalEnum = (values: readonly [string, ...string[]]) =>
  z.preprocess(blankToNull, z.enum(values).nullable());
// Repeats are rejected, not removed (API section 5). No default, so PATCH schemas stay partial.
export const uniqueList = <T extends z.ZodType>(item: T, max = Infinity) =>
  z
    .array(item)
    .max(max)
    .refine((a) => new Set(a).size === a.length, 'Values must not repeat.');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Path id that is not a UUID is 404 NOT_FOUND, the same as a missing id (API section 2).
export function uuidOr404(id: string) {
  if (!UUID.test(id)) throw notFound();
  return id;
}
export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found.');
