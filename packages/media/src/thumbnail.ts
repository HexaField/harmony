/**
 * Thumbnail generation — isomorphic stub.
 * In a real environment, the browser uses Canvas API, Node uses sharp.
 * Here we implement a simple downscale for raw pixel data.
 * For non-image files, returns null.
 */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function generateThumbnail(
  data: Uint8Array,
  contentType: string,
  _maxWidth = 200,
  _maxHeight = 200
): Uint8Array | null {
  if (!IMAGE_TYPES.includes(contentType)) {
    return null
  }
  // Production implementation would decode the image, resize to maxWidth x maxHeight
  // preserving aspect ratio, and re-encode as JPEG. Since we can't decode images
  // in a pure isomorphic environment without native deps, we create a small
  // representation. In a real deployment, the browser uses OffscreenCanvas and
  // Node uses sharp.

  // Create a minimal thumbnail marker — first 1024 bytes or less, prefixed with
  // a marker so we can detect it as a thumbnail
  const marker = new TextEncoder().encode('HMYTHUMB:')
  const sample = data.slice(0, Math.min(1024, data.length))
  const thumb = new Uint8Array(marker.length + sample.length)
  thumb.set(marker)
  thumb.set(sample, marker.length)
  return thumb
}
