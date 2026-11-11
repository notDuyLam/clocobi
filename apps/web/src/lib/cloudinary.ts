// Grid thumbnails through a Cloudinary transformation (API AD14): each size is made once and
// cached by the CDN, and a ~20 KB thumbnail costs far less bandwidth than the full photo.
// Full-size views use the plain URL.
const MARK = '/image/upload/';

export function thumb(url: string, width = 400) {
  const i = url.indexOf(MARK);
  if (i < 0) return url;
  const at = i + MARK.length;
  return `${url.slice(0, at)}c_limit,w_${width},f_auto,q_auto/${url.slice(at)}`;
}
