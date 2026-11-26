// Keep incoming links to the former portfolio sections working.
const portfolioAnchors = new Set(['home', 'impact', 'about', 'experience', 'interview-demo', 'projects', 'case-studies', 'education', 'skills', 'contact']);
function restorePortfolioLink() {
  if (portfolioAnchors.has(location.hash.slice(1))) location.replace(`/work/${location.hash}`);
}
if (location.pathname === '/' || location.pathname === '/index.html') {
  restorePortfolioLink();
  window.addEventListener('hashchange', restorePortfolioLink);
}
