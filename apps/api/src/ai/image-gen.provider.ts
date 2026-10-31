// Image generation behind an interface, so the provider can change (NFR-009, TDD 4.3).
export interface ImageRef {
  data: Buffer;
  mimeType: string;
}

export interface ImageGenProvider {
  // At most 4 references, each smaller than 512x512.
  generateOutfitImage(references: ImageRef[], prompt: string): Promise<Buffer>;
}

export const IMAGE_GEN = Symbol('IMAGE_GEN');
