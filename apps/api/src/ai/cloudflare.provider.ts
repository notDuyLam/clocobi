import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { env } from '../common/env.js';
import type { ImageGenProvider, ImageRef } from './image-gen.provider.js';

const TIMEOUT_MS = 60_000; // TDD 4.1

interface CfResponse {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: { image?: string };
}

// TDD 4.3 error mapping. Quota shape is unverified (open item 14): 429 or an allowance message.
export function toImageError(status: number, body: CfResponse) {
  const errors = body.errors ?? [];
  if (errors.some((e) => e.code === 8007)) {
    return new ApiError(
      422,
      'IMAGE_REJECTED',
      'The image service rejected this outfit. Try another outfit.',
    );
  }
  if (
    status === 429 ||
    errors.some((e) => /daily|allowance|neuron|quota/i.test(e.message ?? ''))
  ) {
    return new ApiError(
      503,
      'IMAGE_QUOTA_EXHAUSTED',
      'The daily image quota is used up. Try again after 00:00 UTC.',
    );
  }
  return new ApiError(
    502,
    'IMAGE_FAILED',
    'The image service failed. Please try again.',
  );
}

@Injectable()
export class CloudflareProvider implements ImageGenProvider {
  private readonly logger = new Logger('Cloudflare');

  async generateOutfitImage(references: ImageRef[], prompt: string) {
    const form = new FormData();
    form.set('prompt', prompt);
    form.set('width', env('CF_IMAGE_WIDTH'));
    form.set('height', env('CF_IMAGE_HEIGHT'));
    form.set('seed', String(Math.floor(Math.random() * 2 ** 31)));
    // References as binary file parts (confirmed live 2026-11-01).
    references
      .slice(0, 4)
      .forEach((r, i) =>
        form.set(
          `input_image_${i}`,
          new Blob([new Uint8Array(r.data)], { type: r.mimeType }),
          `ref${i}`,
        ),
      );
    let res: Response;
    let body: CfResponse;
    try {
      res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env('CF_ACCOUNT_ID')}/ai/run/${env('CF_IMAGE_MODEL')}`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${env('CF_API_TOKEN')}` },
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      body = (await res.json().catch(() => ({}))) as CfResponse;
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') {
        throw new ApiError(
          504,
          'IMAGE_TIMEOUT',
          'The image service took too long. Please try again.',
        );
      }
      this.logger.error(`request failed: ${String(e)}`);
      throw toImageError(0, {});
    }
    const image = body.result?.image;
    if (!res.ok || !image) {
      this.logger.error(
        `HTTP ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`,
      );
      throw toImageError(res.status, body);
    }
    return Buffer.from(image, 'base64');
  }
}
