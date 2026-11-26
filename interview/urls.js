const PORTFOLIO_ANCHORS = new Set(['home', 'impact', 'about', 'experience', 'interview-demo', 'projects', 'case-studies', 'education', 'skills', 'contact']);

// The API may still run a corpus built before the homepage move.
// Accept both generations of citation URLs at either interview entry point.
export function evidenceUrl(value, origin = window.location.origin) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, `${origin}/interview/`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.origin === origin || url.origin === 'https://alexandre-sdd.github.io') {
      if ((url.pathname === '/index.html' || url.pathname === '/') && PORTFOLIO_ANCHORS.has(url.hash.slice(1))) {
        url.pathname = '/work/';
      }
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return url.href;
  } catch {
    return null;
  }
}
