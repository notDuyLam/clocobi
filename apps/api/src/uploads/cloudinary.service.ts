import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiError } from '../common/api-error.js';
import { env } from '../common/env.js';

// Timeout for each backend call to Cloudinary (TDD section 4.1).
const TIMEOUT_MS = 15_000;

// Cloudinary signature: params sorted by name, joined as k=v with &, then the API secret, SHA-1 hex.
export function signParams(
  params: Record<string, string | number>,
  secret: string,
) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1')
    .update(toSign + secret)
    .digest('hex');
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  // Values the browser needs for a signed direct upload of exactly this public ID (TDD section 5).
  signUpload(publicId: string) {
    const cloudName = env('CLOUDINARY_CLOUD_NAME');
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      cloudName,
      apiKey: env('CLOUDINARY_API_KEY'),
      timestamp,
      publicId,
      signature: signParams(
        { public_id: publicId, timestamp },
        env('CLOUDINARY_API_SECRET'),
      ),
    };
  }

  // Display URL, no transformations (API section 2).
  url(publicId: string) {
    return `https://res.cloudinary.com/${env('CLOUDINARY_CLOUD_NAME')}/image/upload/${publicId}`;
  }

  // Photo bytes for AI analysis (TDD 4.1). A missing file is the caller's bad public ID.
  async download(publicId: string) {
    const res = await fetch(this.url(publicId), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) {
      throw new ApiError(400, 'INVALID_PUBLIC_ID', 'Photo not found.');
    }
    if (!res.ok) {
      throw new Error(
        `Cloudinary download of ${publicId} failed: ${res.status}`,
      );
    }
    return {
      data: Buffer.from(await res.arrayBuffer()),
      mimeType: res.headers.get('content-type') ?? 'image/jpeg',
    };
  }

  // Best-effort delete after a database delete (AD2): logs failures, never throws.
  async destroy(publicId: string) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = new URLSearchParams({
        public_id: publicId,
        timestamp: String(timestamp),
        api_key: env('CLOUDINARY_API_KEY'),
        signature: signParams(
          { public_id: publicId, timestamp },
          env('CLOUDINARY_API_SECRET'),
        ),
      });
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${env('CLOUDINARY_CLOUD_NAME')}/image/destroy`,
        { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      const result = ((await res.json()) as { result?: string }).result;
      // "not found" is fine: the file is gone either way.
      if (result !== 'ok' && result !== 'not found') {
        this.logger.warn(
          `Cloudinary delete of ${publicId} failed: ${res.status} ${result}`,
        );
      }
    } catch (e) {
      this.logger.warn(`Cloudinary delete of ${publicId} failed: ${String(e)}`);
    }
  }
}
