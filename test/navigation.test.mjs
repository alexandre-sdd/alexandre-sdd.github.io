import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {evidenceUrl} from '../interview/urls.js';

test('both interview entry points share one shell and static escape routes',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.equal(html,fs.readFileSync('interview/index.html','utf8'));
  assert.match(html,/<a href="\/work\/">Browse my work<\/a>/);
  assert.match(html,/<a href="\/assets\/resume\/resume_april.pdf">Résumé<\/a>/);
  assert.match(html,/<noscript>/);
});

test('citations normalize old portfolio, root-relative, and external URLs safely',()=>{
  const origin='https://preview.example';
  for(const value of ['../index.html#experience','/index.html#experience','https://alexandre-sdd.github.io/index.html#experience'])assert.equal(evidenceUrl(value,origin),'/work/#experience');
  assert.equal(evidenceUrl('../case-study-chanel.html',origin),'/case-study-chanel.html');
  assert.equal(evidenceUrl('/work/#experience-0',origin),'/work/#experience-0');
  assert.equal(evidenceUrl('../assets/projects/Combination_Outlier_Detection.pdf',origin),'/assets/projects/Combination_Outlier_Detection.pdf');
  assert.equal(evidenceUrl('https://github.com/alexandre-sdd/zeit-project',origin),'https://github.com/alexandre-sdd/zeit-project');
  for(const value of ['javascript:alert(1)','data:text/html,unsafe','https://user:secret@example.com',null,''])assert.equal(evidenceUrl(value,origin),null);
});

test('static pages and generated citations resolve local assets, routes, and anchors',()=>{
  const pages=['index.html','interview/index.html','work/index.html','case-study-chanel.html','case-study-forvia.html','ai-lexandre-system.html','tomorrow-you-maintenance.html'];
  const refs=[];
  for(const file of pages) {
    const html=fs.readFileSync(file,'utf8');
    for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g))refs.push({value:match[1],base:`https://test.example/${file}`});
  }
  const corpus=JSON.parse(fs.readFileSync('packages/interview-core/generated/corpus.json','utf8'));
  for(const chunk of corpus.chunks)refs.push({value:chunk.publicUrl,base:'https://test.example/'});
  for(const {value,base} of refs) {
    const url=new URL(value,base);
    if(url.origin!=='https://test.example')continue;
    let file=decodeURIComponent(url.pathname).slice(1) || 'index.html';
    if(file.endsWith('/'))file+='index.html';
    assert.ok(fs.existsSync(file),`Missing ${file} linked from ${base}`);
    if(url.hash && path.extname(file)==='.html')assert.ok(fs.readFileSync(file,'utf8').includes(`id="${url.hash.slice(1)}"`),`Missing anchor ${url.hash} in ${file}`);
  }
});
