// Photo resize before upload (TDD 5): longest edge at most 1600 px, never enlarged, JPEG 0.85.
export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;

export function fitWithin(width: number, height: number, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function resizePhoto(file: Blob): Promise<Blob> {
  // createImageBitmap applies the EXIF orientation, so phone photos keep their rotation.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not encode the photo.')),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  );
}
