/**
 * Baseline HTTP security headers.
 *
 * CollegeOS serves a JSON API plus a small number of non-sensitive static
 * avatar/signature images, so a conservative Content-Security-Policy is safe:
 * nothing in the API responses requires inline script or third-party framing.
 * The header set is applied to every response, including errors.
 */

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  res.removeHeader("X-Powered-By");
  next();
}

export default securityHeaders;