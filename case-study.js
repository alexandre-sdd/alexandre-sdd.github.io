const qs = (sel, scope = document) => scope.querySelector(sel);

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const makeEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === 'string') el.textContent = text;
  return el;
};

const isExternal = (url) => /^https?:\/\//i.test(url);

const setLinkAttrs = (a, url) => {
  a.href = url;
  if (isExternal(url)) {
    a.target = '_blank';
    a.rel = 'noreferrer';
  }
};

const checkAssetExists = async (url) => {
  if (!url) return 'missing';
  if (window.location.protocol === 'file:') return 'unknown';

  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return 'available';
    if (head.status === 404) return 'missing';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

const ARTIFACT_TYPES = [
  { key: 'code', label: 'Code', icon: '</>' },
  { key: 'demo', label: 'Demo', icon: 'Demo' },
  { key: 'writeup', label: 'Write-up', icon: 'Doc' },
  { key: 'slides', label: 'Slides', icon: 'Deck' }
];

const renderArtifacts = (container, artifacts = {}, showTodos = true) => {
  if (!container) return;
  container.innerHTML = '';

  ARTIFACT_TYPES.forEach((item) => {
    const href = clean(artifacts[item.key]);
    if (href) {
      const link = makeEl('a', 'artifact-link');
      setLinkAttrs(link, href);
      const icon = makeEl('span', 'artifact-icon', item.icon);
      icon.setAttribute('aria-hidden', 'true');
      const label = makeEl('span', '', item.label);
      link.append(icon, label);
      container.appendChild(link);
      return;
    }

    if (showTodos) {
      const todo = makeEl('span', 'artifact-link todo');
      const icon = makeEl('span', 'artifact-icon', item.icon);
      icon.setAttribute('aria-hidden', 'true');
      const label = makeEl('span', '', `${item.label}: Add link`);
      todo.append(icon, label);
      container.appendChild(todo);
    }
  });
};

const renderList = (selector, items = [], fallbackTodo) => {
  const container = qs(selector);
  if (!container) return;
  container.innerHTML = '';

  if (Array.isArray(items) && items.length > 0) {
    items.forEach((item) => {
      container.appendChild(makeEl('li', '', item));
    });
    return;
  }

  const todo = makeEl('li', 'todo-text', fallbackTodo);
  container.appendChild(todo);
};

const renderMedia = (mediaItems = []) => {
  const mediaGrid = qs('#case-media-grid');
  if (!mediaGrid) return;
  mediaGrid.innerHTML = '';

  if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
    const placeholder = makeEl('figure', 'media-card');
    const img = document.createElement('img');
    img.src = './assets/placeholder.svg';
    img.alt = 'Placeholder case-study visual.';
    img.loading = 'lazy';
    placeholder.appendChild(img);
    placeholder.appendChild(makeEl('figcaption', '', 'TODO: Add screenshot or GIF.'));
    mediaGrid.appendChild(placeholder);
    return;
  }

  mediaItems.forEach((item) => {
    const figure = makeEl('figure', 'media-card');
    const img = document.createElement('img');
    img.src = clean(item.src) || './assets/placeholder.svg';
    img.alt = clean(item.alt) || 'Case-study visual.';
    img.loading = 'lazy';
    img.decoding = 'async';
    figure.appendChild(img);

    const type = clean(item.type);
    const captionText = clean(item.caption);
    if (type || captionText) {
      const label = type ? `${type.toUpperCase()} · ` : '';
      figure.appendChild(makeEl('figcaption', '', `${label}${captionText}`.trim()));
    }

    mediaGrid.appendChild(figure);
  });
};

const renderCaseStudy = async () => {
  const caseId = clean(document.body.dataset.caseStudyId);
  if (!caseId) return;

  const res = await fetch('./content.json');
  if (!res.ok) return;

  const data = await res.json();
  const caseStudy = Array.isArray(data.caseStudies)
    ? data.caseStudies.find((item) => item.id === caseId)
    : null;

  if (qs('#brand-title')) qs('#brand-title').textContent = data.headline;
  if (qs('#footer-text')) qs('#footer-text').textContent = `© ${new Date().getFullYear()} ${data.name}`;

  const navResume = qs('#case-nav-resume-link');
  const resumeUrl = clean(data.links?.resume);
  const resumeExists = await checkAssetExists(resumeUrl);
  if (navResume) {
    if (resumeUrl && resumeExists !== 'missing') {
      setLinkAttrs(navResume, resumeUrl);
      navResume.classList.remove('is-hidden');
    } else {
      navResume.classList.add('is-hidden');
    }
  }

  if (!caseStudy) {
    if (qs('#case-title')) qs('#case-title').textContent = 'Case study not found';
    if (qs('#case-summary')) qs('#case-summary').textContent = 'TODO: Add matching case-study entry in content.json.';
    return;
  }

  if (qs('#case-title')) qs('#case-title').textContent = caseStudy.title;

  const metaParts = [clean(caseStudy.subtitle), clean(caseStudy.location), clean(caseStudy.dates)].filter(Boolean);
  if (qs('#case-meta')) qs('#case-meta').textContent = metaParts.join(' · ');
  if (qs('#case-summary')) qs('#case-summary').textContent = clean(caseStudy.summary);

  renderArtifacts(qs('#case-artifacts-top'), caseStudy.artifacts, true);
  renderArtifacts(qs('#case-artifacts-block'), caseStudy.artifacts, true);

  renderList('#case-context', caseStudy.context, 'TODO: Add context details.');
  renderList('#case-problem', caseStudy.problem, 'TODO: Add problem statement details.');
  renderList('#case-constraints', caseStudy.constraints, 'TODO: Add constraints.');
  renderList('#case-approach', caseStudy.approach, 'TODO: Add approach details.');
  renderList('#case-results', caseStudy.results, 'TODO: Add factual results.');
  renderList('#case-tech-stack', caseStudy.techStack, 'TODO: Add tech stack details.');
  renderList('#case-next-improvements', caseStudy.nextImprovements, 'TODO: Add next-iteration improvements.');

  renderMedia(caseStudy.media);
};

renderCaseStudy().catch(() => {});
