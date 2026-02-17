const qs = (sel, scope = document) => scope.querySelector(sel);

const makeEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === 'string') el.textContent = text;
  return el;
};

const buildList = (items = []) => {
  const ul = document.createElement('ul');
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  return ul;
};

const isExternal = (url) => /^https?:\/\//i.test(url);

const setLinkAttrs = (a, url) => {
  a.href = url;
  if (isExternal(url)) {
    a.target = '_blank';
    a.rel = 'noreferrer';
  }
};

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const isDevMode = () => {
  const host = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  return host === 'localhost' || host === '127.0.0.1' || window.location.protocol === 'file:' || params.has('dev');
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

const createButton = ({ label, url, primary = false, todoLabel = '' }) => {
  if (url) {
    const link = document.createElement('a');
    link.className = `button ${primary ? 'primary' : 'ghost'}`;
    link.textContent = label;
    setLinkAttrs(link, url);
    return link;
  }

  // TODO: Fill missing CTA link in content.json so this disabled placeholder is not rendered.
  const span = document.createElement('span');
  span.className = `button ${primary ? 'primary' : 'ghost'} button-disabled`;
  span.setAttribute('aria-disabled', 'true');
  span.textContent = todoLabel || `${label} (Add link)`;
  return span;
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
      // TODO: Add missing artifact links in content.json (code/demo/writeup/slides).
      const todo = makeEl('span', 'artifact-link todo');
      todo.setAttribute('data-todo', `TODO: Add ${item.label.toLowerCase()} link.`);
      const icon = makeEl('span', 'artifact-icon', item.icon);
      icon.setAttribute('aria-hidden', 'true');
      const label = makeEl('span', '', `${item.label}: Add link`);
      todo.append(icon, label);
      container.appendChild(todo);
    }
  });
};

const renderHeroLinks = (data, resumeReady) => {
  const heroLinks = qs('#hero-links');
  if (!heroLinks) return;
  heroLinks.innerHTML = '';

  const resumeUrl = resumeReady ? clean(data.links?.resume) : '';
  const githubUrl = clean(data.links?.github);
  const linkedinUrl = clean(data.links?.linkedin);
  const emailUrl = clean(data.links?.email) ? `mailto:${clean(data.links.email)}` : '';

  heroLinks.appendChild(createButton({
    label: 'Resume (PDF)',
    url: resumeUrl,
    primary: true,
    todoLabel: 'Resume (Add link)'
  }));

  heroLinks.appendChild(createButton({
    label: 'GitHub',
    url: githubUrl,
    todoLabel: 'GitHub (Add link)'
  }));

  heroLinks.appendChild(createButton({ label: 'LinkedIn', url: linkedinUrl }));
  heroLinks.appendChild(createButton({ label: 'Email', url: emailUrl }));
};

const renderImpactHighlights = (items = []) => {
  const strip = qs('#impact-highlights');
  if (!strip) return;
  strip.innerHTML = '';

  items.slice(0, 3).forEach((item) => {
    strip.appendChild(makeEl('article', 'impact-item', item));
  });
};

const renderFeaturedProjects = (projects = []) => {
  const featuredGrid = qs('#featured-projects-grid');
  if (!featuredGrid) return;
  featuredGrid.innerHTML = '';

  projects.slice(0, 2).forEach((project) => {
    const card = makeEl('article', 'featured-card');

    const image = document.createElement('img');
    // TODO: Replace placeholder thumbnail with project screenshot/GIF preview.
    image.src = clean(project.thumbnail) || './assets/placeholder.svg';
    image.alt = `${project.title} project thumbnail`;
    image.loading = 'lazy';
    card.appendChild(image);

    const body = makeEl('div', 'featured-body');
    body.appendChild(makeEl('h4', '', project.title));
    body.appendChild(makeEl('p', '', project.summary));

    if (clean(project.result)) {
      body.appendChild(makeEl('p', 'result-line', `Result: ${project.result}`));
    } else {
      // TODO: Add a factual result line (or remove) once measurable output is available.
      const resultTodo = makeEl('p', 'result-line todo-text', 'Result: TODO (Available on request)');
      resultTodo.setAttribute('data-todo', 'TODO: Add factual project result line or remove this.');
      body.appendChild(resultTodo);
    }

    const artifacts = makeEl('div', 'artifacts-row');
    artifacts.setAttribute('aria-label', `${project.title} artifacts`);
    renderArtifacts(artifacts, project.artifacts, true);
    body.appendChild(artifacts);

    if (clean(project.caseStudyPage) && !clean(project.artifacts?.writeup)) {
      const caseLink = makeEl('a', 'case-link-inline', 'Case study');
      setLinkAttrs(caseLink, clean(project.caseStudyPage));
      body.appendChild(caseLink);
    }

    card.appendChild(body);
    featuredGrid.appendChild(card);
  });
};

const renderOtherProjects = (projects = []) => {
  const grid = qs('#other-projects-grid');
  if (!grid) return;
  grid.innerHTML = '';

  projects.forEach((project) => {
    const card = makeEl('article', 'card light-card');
    card.appendChild(makeEl('h4', '', project.title));
    card.appendChild(makeEl('p', '', project.summary));

    if (Array.isArray(project.tags) && project.tags.length > 0) {
      const tags = makeEl('div', 'tags');
      project.tags.forEach((tag) => tags.appendChild(makeEl('span', 'tag', tag)));
      card.appendChild(tags);
    }

    grid.appendChild(card);
  });
};

const renderCaseStudyLinks = (caseStudies = []) => {
  const holder = qs('#case-study-links');
  if (!holder) return;
  holder.innerHTML = '';

  caseStudies.forEach((item) => {
    if (!clean(item.page)) return;
    const link = makeEl('a', 'case-link', item.title);
    setLinkAttrs(link, clean(item.page));
    holder.appendChild(link);
  });
};

const renderTimeline = (selector, items = [], mapper) => {
  const container = qs(selector);
  if (!container) return;
  container.innerHTML = '';

  items.forEach((item) => {
    const entry = makeEl('article', 'timeline-item');
    entry.appendChild(makeEl('h3', '', mapper.title(item)));
    entry.appendChild(makeEl('p', 'meta', mapper.meta(item)));
    entry.appendChild(buildList(item.highlights || item.details || []));
    container.appendChild(entry);
  });
};

const renderSkills = (skills = []) => {
  const grid = qs('#skills-grid');
  if (!grid) return;
  grid.innerHTML = '';

  skills.forEach((group) => {
    const card = makeEl('div', 'skill-group');
    card.appendChild(makeEl('h3', '', group.group));
    card.appendChild(buildList(group.items));
    grid.appendChild(card);
  });
};

const renderContact = (data, resumeReady) => {
  const contactCard = qs('#contact-card');
  if (!contactCard) return;
  contactCard.innerHTML = '';

  contactCard.appendChild(makeEl('p', '', `Location: ${data.location}`));

  const links = makeEl('div', 'contact-links');

  if (clean(data.links?.email)) {
    const email = makeEl('a', '', clean(data.links.email));
    email.href = `mailto:${clean(data.links.email)}`;
    links.appendChild(email);
  }

  if (clean(data.links?.linkedin)) {
    const linkedin = makeEl('a', '', 'LinkedIn');
    setLinkAttrs(linkedin, clean(data.links.linkedin));
    links.appendChild(linkedin);
  }

  if (clean(data.links?.github)) {
    const github = makeEl('a', '', 'GitHub');
    setLinkAttrs(github, clean(data.links.github));
    links.appendChild(github);
  }

  if (resumeReady && clean(data.links?.resume)) {
    const resume = makeEl('a', '', 'Resume (PDF)');
    setLinkAttrs(resume, clean(data.links.resume));
    links.appendChild(resume);
  }

  contactCard.appendChild(links);

  const recruiterCtaBtn = qs('.recruiter-cta .button');
  if (recruiterCtaBtn && clean(data.links?.email)) {
    const encodedSubject = encodeURIComponent('Summer 2026 Internship Role');
    const encodedBody = encodeURIComponent('Hi Alexandre,\n\nTeam: \nRole: \nWhy you: \n');
    recruiterCtaBtn.href = `mailto:${clean(data.links.email)}?subject=${encodedSubject}&body=${encodedBody}`;
  }
};

const renderRecruiterFacts = (facts = {}) => {
  const location = qs('#quick-fact-location');
  const availability = qs('#quick-fact-availability');
  const interests = qs('#quick-fact-interests');

  if (location) location.textContent = clean(facts.location);
  if (availability) availability.textContent = clean(facts.availability);
  if (interests && Array.isArray(facts.interests)) {
    interests.textContent = facts.interests.join(', ');
  }
};

const render = async () => {
  const res = await fetch('./content.json');
  if (!res.ok) return;
  const data = await res.json();

  const resumeUrl = clean(data.links?.resume);
  const resumeExists = await checkAssetExists(resumeUrl);
  const resumeReady = resumeExists !== 'missing' && Boolean(resumeUrl);

  const resumeBanner = qs('#resume-upload-todo');
  const usingPlaceholderResume = resumeUrl === './assets/resume/Alexandre_Resume.pdf' || resumeUrl === 'assets/resume/Alexandre_Resume.pdf';
  if (resumeBanner) {
    if (isDevMode() && usingPlaceholderResume) {
      resumeBanner.classList.remove('is-hidden');
    } else {
      resumeBanner.classList.add('is-hidden');
    }
  }

  const navResume = qs('#nav-resume-link');
  if (navResume) {
    if (resumeReady) {
      setLinkAttrs(navResume, resumeUrl);
      navResume.classList.remove('is-hidden');
    } else {
      navResume.classList.add('is-hidden');
    }
  }

  if (qs('#brand-name')) qs('#brand-name').textContent = data.name;
  if (qs('#brand-title')) qs('#brand-title').textContent = data.headline;
  if (qs('#hero-name')) qs('#hero-name').textContent = data.name;
  if (qs('#hero-location')) qs('#hero-location').textContent = data.location;
  if (qs('#hero-target-line')) qs('#hero-target-line').textContent = data.targetRoleLine;
  if (qs('#hero-about')) qs('#hero-about').textContent = data.about;
  if (qs('#about-text')) qs('#about-text').textContent = data.about;
  if (qs('#footer-text')) qs('#footer-text').textContent = `© ${new Date().getFullYear()} ${data.name}`;

  const proofList = qs('#hero-proof-list');
  if (proofList) {
    proofList.innerHTML = '';
    (data.heroProofBullets || []).slice(0, 2).forEach((item) => {
      proofList.appendChild(makeEl('li', '', item));
    });
  }

  renderRecruiterFacts(data.recruiterQuickFacts || {});
  renderHeroLinks(data, resumeReady);
  renderImpactHighlights(data.impactHighlights || []);

  const projects = Array.isArray(data.projects) ? data.projects : [];
  const featured = projects.filter((project) => project.featured).slice(0, 2);
  const featuredIds = new Set(featured.map((project) => project.id));
  const other = projects.filter((project) => !featuredIds.has(project.id));

  renderFeaturedProjects(featured);
  renderOtherProjects(other);
  renderCaseStudyLinks(Array.isArray(data.caseStudies) ? data.caseStudies : []);

  renderTimeline('#experience-list', data.experience, {
    title: (item) => `${item.role} · ${item.company}`,
    meta: (item) => `${item.location} · ${item.dates}`
  });

  renderTimeline('#education-list', data.education, {
    title: (item) => `${item.degree} · ${item.school}`,
    meta: (item) => `${item.location} · ${item.dates}`
  });

  renderSkills(data.skills);
  renderContact(data, resumeReady);
};

const setupBackToTop = () => {
  const button = qs('#back-to-top');
  if (!button) return;

  const onScroll = () => {
    if (window.scrollY > 400) {
      button.classList.add('visible');
    } else {
      button.classList.remove('visible');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
};

render().catch(() => {});
setupBackToTop();
