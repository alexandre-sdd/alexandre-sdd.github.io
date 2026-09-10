import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("main.js", "utf8");
const content = JSON.parse(fs.readFileSync("content.json", "utf8"));

test("homepage targets January 2027 full-time roles across the US and Europe", () => {
  assert.equal(content.headline, "Data Scientist | AI/ML Engineering | Operations Research");
  assert.equal(content.availability, "January 2027");
  assert.match(content.targetRoleLine, /full-time Data Science, AI\/ML Engineering, Analytics, and Operations Research/);
  assert.equal(content.recruiterQuickFacts.searchGeography, "United States and Europe");

  assert.match(html, /id="quick-fact-geography">United States and Europe/);
  assert.match(script, /facts\.searchGeography/);
  assert.match(script, /Full-time Opportunity - January 2027/);
  assert.doesNotMatch(`${html}\n${script}\n${JSON.stringify(content)}`, /Summer 2026 Internship|Summer 2026 Data Science/);
});

test("Tiffany is the newest experience and includes corpus learning evidence", () => {
  const tiffany = content.experience[0];

  assert.equal(tiffany.company, "Tiffany & Co., Global Demand Planning");
  assert.equal(tiffany.role, "Demand Planning Intern, Supply Chain & Logistics");
  assert.equal(tiffany.dates, "Jun 2026 - Aug 2026");
  assert.match(tiffany.highlights.join(" "), /2\.9 million/);
  assert.match(tiffany.highlights.join(" "), /68 validated price changes/);
  assert.ok(tiffany.learning.decisions.length > 0);
  assert.ok(tiffany.learning.lessons.length > 0);
  assert.match(html, /Tiffany &amp; Co\., Global Demand Planning/);
});

test("education and Nantes facts match the refreshed source material", () => {
  const columbia = content.education.find((item) => item.school === "Columbia University");
  const centrale = content.education.find((item) => item.school.includes("CentraleSupélec"));
  const nantes = content.experience.find((item) => item.company.includes("Nantes University Hospital"));
  const cuimc = content.experience.find((item) => item.company === "Columbia Business School & CUIMC");

  assert.equal(columbia.details[0], "GPA: 3.96/4.00");
  assert.equal(centrale.details[0], "GPA: 3.93/4.00");
  assert.equal(cuimc.dates, "Mar 2026 - Jul 2026");
  assert.equal(nantes.dates, "Feb 2026 - Aug 2026");
  assert.match(nantes.highlights.join(" "), /human-validated, Excel-exportable scheduling MVP/);
  assert.match(nantes.highlights.join(" "), /Separately built a respiratory-system planning component/);
  assert.match(html, /New York, NY · Mar 2026 - Jul 2026/);
});

test("homepage sections follow the career-first hierarchy", () => {
  const sectionOrder = [
    'id="home"',
    'id="impact"',
    'id="about"',
    'id="experience"',
    'id="interview-demo"',
    'id="projects"',
    'id="case-studies"',
    'id="education"',
    'id="skills"',
    'id="contact"'
  ].map((marker) => html.indexOf(marker));

  assert.ok(sectionOrder.every((position) => position >= 0));
  assert.deepEqual(sectionOrder, [...sectionOrder].sort((a, b) => a - b));
});
