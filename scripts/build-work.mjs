import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const content=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
const escape=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>s?.startsWith('./')?`/${s.slice(2)}`:s?.startsWith('#')?`/work/${s}`:s;
const link=(href,text,cls='')=>href?`<a${cls?` class="${cls}"`:''} href="${escape(url(href))}">${escape(text)}</a>`:'';
const list=items=>`<ul>${(items || []).map(s=>`<li>${escape(s)}</li>`).join('')}</ul>`;
const projects=content.projects;
const project=id=>projects.find(p=>p.id===id);
const artifactLinks=(p)=>{
 const names={code:`${p.title} repository`,demo:p.id==='ai-lexandre'?'Try the interview':p.id==='tomorrow-you'?'Demo availability':`Open ${p.title}`,writeup:p.id==='tomorrow-you'?'Tomorrow You architecture':p.id==='zeit-project'?'Zeit scheduling documentation':`${p.title} report`,slides:`${p.title} presentation`};
 return Object.entries(p.artifacts || {}).filter(([,v])=>v).map(([k,v])=>link(v,names[k])).join('');
};
const detailedProject=(id,heading,context)=>{
 const p=project(id);
 return `<article class="project-feature" id="${escape(p.id)}"><div class="project-context">${escape(context)}</div><div class="project-story"><h3>${escape(heading)}</h3><p class="project-title">${escape(p.title)}</p><p>${escape(p.summary)}</p><p>${escape(p.result || '')}</p><div class="project-links">${artifactLinks(p)}</div></div></article>`;
};
const featuredIds=new Set(['ai-lexandre','zeit-project','tomorrow-you']);
const experience=content.experience.map((e,i)=>`<article class="career-entry" id="experience-${i}"><div class="career-period"><p>${escape(e.dates)}</p><p>${escape(e.location)}</p></div><div><h3>${escape(e.company)}</h3><p class="career-role">${escape(e.role)}</p>${list(e.highlights)}${e.learning?.evidenceNotes?`<p class="scope-note">${escape(e.learning.evidenceNotes)}</p>`:''}${e.company.includes('CHANEL')?`<div class="project-links">${link('/case-study-chanel.html','CHANEL method and case study')}${link('/assets/projects/Combination_Outlier_Detection.pdf','Combination Outlier Detection')}</div>`:''}</div></article>`).join('');
const education=content.education.map((e,i)=>`<article class="career-entry" id="education-${i}"><div class="career-period"><p>${escape(e.dates)}</p><p>${escape(e.location)}</p></div><div><h3>${escape(e.school)}</h3><p class="career-role">${escape(e.degree)}</p>${list(e.details)}</div></article>`).join('');

const html=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f7f9fb">
  <title>Work — Alexandre Sepulveda de Dietrich</title>
  <meta name="description" content="Data science, AI engineering, and operations research: Alexandre's projects, career, education, and published evidence.">
  <meta property="og:title" content="Work — Alexandre Sepulveda de Dietrich">
  <meta property="og:description" content="Projects, decisions, and the work behind AI-lexandre's answers.">
  <meta property="og:type" content="website"><meta property="og:url" content="https://alexandre-sdd.github.io/work/">
  <meta property="og:image" content="https://alexandre-sdd.github.io/assets/og/og-image.png">
  <link rel="canonical" href="https://alexandre-sdd.github.io/work/">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/plex-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/styles.css">
</head>
<body class="work-page">
<a class="skip-link" href="#home">Skip to work</a>
<div class="page">
  <header class="site-header"><a class="brand-name" href="/">Alexandre Sepulveda de Dietrich</a><nav class="site-nav" aria-label="Primary"><a href="/" data-interview-return>Back to interview</a>${link(content.links.resume,'Résumé')}<a href="#contact">Contact</a></nav></header>
  <main id="home">
    <section class="work-intro" aria-labelledby="work-title"><div><h1 id="work-title">The work behind<br>the answers.</h1><p class="work-lead">I turn commercial, financial, and operational data into decision tools.</p><p class="availability">Full-time from January 2027. United States &amp; Europe.</p></div><figure><img src="/assets/portrait.jpg" width="160" height="200" alt="Alexandre Sepulveda de Dietrich"></figure></section>
    <nav class="section-nav" aria-label="Work sections"><a href="#projects">Selected work</a><a href="#experience">Experience</a><a href="#education">Education</a><a href="#skills">Skills</a></nav>
    <section id="projects" class="work-section" aria-labelledby="projects-title"><div class="section-heading"><h2 id="projects-title">Selected work</h2><p>Working systems, research, and public method notes.</p></div>
      ${detailedProject('ai-lexandre','An interview you can question.','AI engineering')}
      <article class="project-feature" id="chanel"><div class="project-context">Applied machine learning</div><div class="project-story"><h3>Two ways a transaction can look wrong.</h3><p class="project-title">CHANEL Europe</p><p>Amount anomalies depend on business context. Unusual categorical combinations are a different signal. I combined both into ranked, interpretable candidates for finance review.</p><p class="scope-note">The method is public. Company data, source code, and internal dashboards are confidential.</p><div class="project-links">${link('/case-study-chanel.html','Read the CHANEL case study')}${link('/assets/projects/Combination_Outlier_Detection.pdf','Combination Outlier Detection')}</div></div></article>
      ${detailedProject('zeit-project','A schedule that admits what won’t fit.','Operations research')}
      ${detailedProject('tomorrow-you','A conversation with a possible future.','Voice & agent systems')}
    </section>
    <section id="case-studies" class="work-section" aria-labelledby="research-title"><div class="section-heading"><h2 id="research-title">More projects &amp; research</h2><p>Each link opens the supporting work.</p></div><div class="project-index">${projects.filter(p=>!featuredIds.has(p.id)).map(p=>`<article id="${escape(p.id)}"><h3>${escape(p.title)}</h3><p>${escape(p.summary)}</p><div class="project-links">${artifactLinks(p)}</div></article>`).join('')}<article id="forvia"><h3>Forvia multi-sensor localization</h3><p>Research into combining camera and radar for 3D positioning, using optimal transport, graph methods, and triangulation.</p><div class="project-links">${link('/case-study-forvia.html','Read the Forvia research case study')}${link('/assets/projects/Forvia_Tracking.pdf','Multi-sensor localization research report')}${link('https://github.com/alexandre-sdd/Forvia_OT_tracking','Forvia tracking repository')}</div></article></div></section>
    <section id="impact" class="work-section compact-section" aria-labelledby="impact-title"><h2 id="impact-title">Selected outcomes</h2>${list(content.impactHighlights)}</section>
    <section id="about" class="work-section compact-section" aria-labelledby="about-title"><h2 id="about-title">How I work</h2><p>${escape(content.about)}</p><p>I work across data science, AI/ML engineering, forecasting, optimization, and analytics. The cases below describe the decisions, limits, and evidence behind that work.</p></section>
    <section id="experience" class="work-section" aria-labelledby="experience-title"><div class="section-heading"><h2 id="experience-title">Experience</h2><p>Commercial data, healthcare operations, and applied research.</p></div>${experience}</section>
    <section id="interview-demo" class="interview-invitation"><h2>Ask about a decision.</h2><p>Use AI-lexandre to explore scope, methods, and tradeoffs across this work.</p><a class="button primary" href="/" data-interview-return>Return to the interview</a></section>
    <section id="education" class="work-section" aria-labelledby="education-title"><div class="section-heading"><h2 id="education-title">Education</h2></div>${education}</section>
    <section id="skills" class="work-section" aria-labelledby="skills-title"><div class="section-heading"><h2 id="skills-title">Skills</h2></div><div class="skills-grid">${content.skills.map(g=>`<div><h3>${escape(g.group)}</h3><p>${g.items.map(escape).join(', ')}</p></div>`).join('')}</div></section>
    <section id="contact" class="work-section contact" aria-labelledby="contact-title"><h2 id="contact-title">Let’s talk.</h2><p>Based in ${escape(content.location)}. Available from January 2027.</p><div class="contact-links">${link(`mailto:${content.links.email}?subject=${encodeURIComponent('Full-time Opportunity - January 2027')}`,content.links.email)}${link(content.links.linkedin,'LinkedIn')}${link(content.links.github,'GitHub')}${link(content.links.resume,'Résumé (PDF)')}</div></section>
  </main>
  <footer class="site-footer"><span>Alexandre Sepulveda de Dietrich</span><a href="/" data-interview-return>AI-lexandre</a></footer>
</div>
<script src="/navigation.js" defer></script>
</body></html>
`;
fs.mkdirSync(path.join(root,'work'),{recursive:true});
fs.writeFileSync(path.join(root,'work/index.html'),html);
// Both URLs share the same static shell and the same client implementation.
fs.copyFileSync(path.join(root,'interview/index.html'),path.join(root,'index.html'));
console.log('Built static Work page and synchronized interview entry points.');
