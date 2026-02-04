const qs = (sel) => document.querySelector(sel);

const makeEl = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
};

const buildList = (items) => {
  const ul = document.createElement('ul');
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  return ul;
};

const safeLink = (label, url, isPrimary = false) => {
  if (!url) return null;
  const link = document.createElement('a');
  link.href = url;
  link.textContent = label;
  link.className = `button ${isPrimary ? 'primary' : 'ghost'}`;
  link.target = url.startsWith('http') ? '_blank' : '_self';
  if (link.target === '_blank') {
    link.rel = 'noreferrer';
  }
  return link;
};

const render = async () => {
  const res = await fetch('./content.json');
  if (!res.ok) return;
  const data = await res.json();

  qs('#brand-name').textContent = data.name;
  qs('#brand-title').textContent = data.headline;
  qs('#hero-name').textContent = data.name;
  qs('#hero-location').textContent = data.location;
  qs('#hero-about').textContent = data.about;
  qs('#about-text').textContent = data.about;
  qs('#footer-text').textContent = `© 2026 ${data.name}`;

  const heroLinks = qs('#hero-links');
  heroLinks.innerHTML = '';
  const emailLink = safeLink('Email', `mailto:${data.links.email}`, true);
  if (emailLink) heroLinks.appendChild(emailLink);
  const linkedin = safeLink('LinkedIn', data.links.linkedin);
  if (linkedin) heroLinks.appendChild(linkedin);
  const github = safeLink('GitHub', data.links.github);
  if (github) heroLinks.appendChild(github);

  const projectsGrid = qs('#projects-grid');
  projectsGrid.innerHTML = '';
  data.projects.forEach((project) => {
    const card = makeEl('article', 'card');
    card.appendChild(makeEl('h3', '', project.title));
    card.appendChild(makeEl('p', '', project.summary));
    card.appendChild(buildList(project.highlights));

    const tags = makeEl('div', 'tags');
    project.tags.forEach((tag) => tags.appendChild(makeEl('span', 'tag', tag)));
    card.appendChild(tags);

    if (project.links && project.links.length > 0) {
      const linkRow = makeEl('div', 'contact-links');
      project.links.forEach((link) => {
        if (!link.url) return;
        const a = document.createElement('a');
        a.href = link.url;
        a.textContent = link.label;
        a.target = '_blank';
        a.rel = 'noreferrer';
        linkRow.appendChild(a);
      });
      card.appendChild(linkRow);
    }

    projectsGrid.appendChild(card);
  });

  const experienceList = qs('#experience-list');
  experienceList.innerHTML = '';
  data.experience.forEach((item) => {
    const entry = makeEl('article', 'timeline-item');
    entry.appendChild(makeEl('h3', '', `${item.role} · ${item.company}`));
    entry.appendChild(makeEl('p', 'meta', `${item.location} · ${item.dates}`));
    entry.appendChild(buildList(item.highlights));
    experienceList.appendChild(entry);
  });

  const educationList = qs('#education-list');
  educationList.innerHTML = '';
  data.education.forEach((item) => {
    const entry = makeEl('article', 'timeline-item');
    entry.appendChild(makeEl('h3', '', `${item.degree} · ${item.school}`));
    entry.appendChild(makeEl('p', 'meta', `${item.location} · ${item.dates}`));
    entry.appendChild(buildList(item.details));
    educationList.appendChild(entry);
  });

  const skillsGrid = qs('#skills-grid');
  skillsGrid.innerHTML = '';
  data.skills.forEach((group) => {
    const card = makeEl('div', 'skill-group');
    card.appendChild(makeEl('h3', '', group.group));
    card.appendChild(buildList(group.items));
    skillsGrid.appendChild(card);
  });

  const contactCard = qs('#contact-card');
  contactCard.innerHTML = '';
  contactCard.appendChild(makeEl('p', '', `Location: ${data.location}`));

  const contactLinks = makeEl('div', 'contact-links');
  const email = document.createElement('a');
  email.href = `mailto:${data.links.email}`;
  email.textContent = data.links.email;
  contactLinks.appendChild(email);

  if (data.links.linkedin) {
    const a = document.createElement('a');
    a.href = data.links.linkedin;
    a.textContent = 'LinkedIn';
    a.target = '_blank';
    a.rel = 'noreferrer';
    contactLinks.appendChild(a);
  }

  if (data.links.github) {
    const a = document.createElement('a');
    a.href = data.links.github;
    a.textContent = 'GitHub';
    a.target = '_blank';
    a.rel = 'noreferrer';
    contactLinks.appendChild(a);
  }

  if (data.links.resume) {
    const a = document.createElement('a');
    a.href = data.links.resume;
    a.textContent = 'Resume';
    a.target = '_blank';
    a.rel = 'noreferrer';
    contactLinks.appendChild(a);
  }

  contactCard.appendChild(contactLinks);
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
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
};

render().catch(() => {});
setupBackToTop();
