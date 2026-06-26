/**
 * image-crop.ts — Issue #8.
 *
 * Crops a PNG/JPEG data URL to the given rect using OffscreenCanvas.
 * OffscreenCanvas is available in service workers (background.ts) and in
 * modern content-script contexts without needing a visible DOM.
 */

/**
 * Crops a PNG/JPEG data URL to the given rect.
 *
 * @param dataUrl  Source image as a data URL (e.g. from captureVisibleTab).
 * @param rect     Region to crop, in physical pixels.
 * @returns        Cropped region as a PNG data URL.
 *
 * @example
 *   const cropped = await cropImage(screenshotDataUrl, { x: 100, y: 200, width: 300, height: 80 });
 */
export async function cropImage(
  dataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<string> {
  // Fetch the data URL as a Blob and decode it into an ImageBitmap.
  // createImageBitmap works in both service workers and content scripts.
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(rect.width, rect.height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('cropImage: could not get 2d context from OffscreenCanvas');
  }

  // Draw only the selected region of the source image onto the canvas.
  ctx.drawImage(
    bitmap,
    rect.x,      // source x
    rect.y,      // source y
    rect.width,  // source width
    rect.height, // source height
    0,           // dest x
    0,           // dest y
    rect.width,  // dest width
    rect.height, // dest height
  );

  bitmap.close(); // free GPU memory

  const outputBlob = await canvas.convertToBlob({ type: 'image/png' });

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('cropImage: FileReader failed'));
    reader.readAsDataURL(outputBlob);
  });
}
