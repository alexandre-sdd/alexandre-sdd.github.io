// A project may be opened from either supported interview URL. Preserve its URL,
// including a local API override, without changing ordinary link behavior.
try {
  const returnUrl=sessionStorage.getItem('ai-lexandre-return-url');
  if(returnUrl) {
    const url=new URL(returnUrl,location.origin);
    if(url.origin===location.origin && ['/', '/index.html', '/interview/', '/interview/index.html'].includes(url.pathname)) {
      document.querySelectorAll('[data-interview-return]').forEach(link=>{link.href=url.pathname+url.search;});
    }
  }
} catch { /* Static navigation remains complete when storage is blocked. */ }
