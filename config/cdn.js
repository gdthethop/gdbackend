/**
 * CDN URL rewriting.
 *
 * Set CDN_BASE_URL (e.g. https://d1234abcd.cloudfront.net) to serve all video
 * media through CloudFront. The CloudFront distribution's origin must be the
 * videos S3 bucket (AWS_BUCKET_NAME_VIDEOS), so object keys map 1:1.
 * When CDN_BASE_URL is unset, URLs are returned unchanged.
 */
function toCdnUrl(url) {
  const BUCKET = process.env.AWS_BUCKET_NAME_VIDEOS;
  const base = (process.env.CDN_BASE_URL || '').replace(/\/+$/, '');
  if (!base || !url || !BUCKET) return url;
  try {
    const u = new URL(url);
    const virtualHosted = u.hostname === `${BUCKET}.s3.amazonaws.com` ||
      (u.hostname.startsWith(`${BUCKET}.s3.`) && u.hostname.endsWith('.amazonaws.com'));
    if (virtualHosted) return `${base}${u.pathname}`;
    const pathStyle = /^s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/.test(u.hostname) &&
      u.pathname.startsWith(`/${BUCKET}/`);
    if (pathStyle) return `${base}${u.pathname.slice(BUCKET.length + 1)}`;
  } catch (_) { /* not a URL */ }
  return url;
}

module.exports = { toCdnUrl };
