// Start the static server on :8000 and the mock API on :8787 first.
// PLAYWRIGHT_CHANNEL=chromium uses a Playwright-installed browser instead of Chrome.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';

const site=process.env.PORTFOLIO_URL || 'http://127.0.0.1:8000';
const api=process.env.PORTFOLIO_API || 'http://127.0.0.1:8787';
const output=new URL('../docs/redesign/screenshots/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const axe=await fs.readFile(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
const {links}=JSON.parse(await fs.readFile(new URL('../content.json',import.meta.url),'utf8'));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
const newPage=browser.newPage.bind(browser);
browser.newPage=async(...args)=>{const page=await newPage(...args);page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(12000);return page;};
const results=[];
const screenshot=(page,name)=>page.screenshot({path:new URL(`${name}.png`,output).pathname});
async function check(name,run) {
  try {const details=await run();results.push({name,pass:true,...details});console.log(`PASS ${name}`);}
  catch(error) {results.push({name,pass:false,error:error.message});console.error(`FAIL ${name}: ${error.message}`);}
}
async function accessibility(page) {
  await page.evaluate(axe);
  const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  return result.passes.length;
}
async function overflow(page) {assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
async function ready(page) {await page.waitForFunction(()=>document.getElementById('submit-status').textContent!=='Connecting to the interview…');}

try {
 for(const width of [1280,390,320]) {
  await check(`opening, Work, cases and axe at ${width}px`,async()=>{
    const context=await browser.newContext({viewport:{width,height:width===1280?720:844}});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${site}/?api=${api}`);await ready(page);await page.evaluate(()=>document.fonts.ready);
    for(const selector of ['#question-input','#submit-button','.identity-nav a:first-child','.identity-nav a:last-child']) {
      const box=await page.locator(selector).boundingBox();assert.ok(box && box.y>=0 && box.y+box.height<=page.viewportSize().height,`${selector} outside first viewport`);
    }
    const contact=page.getByRole('navigation',{name:'Contact Alexandre'});
    for(const [name,href] of [['Email the real me',`mailto:${links.email}`],['LinkedIn',links.linkedin],['GitHub',links.github]]) {
      const link=contact.getByRole('link',{name,exact:true});
      assert.ok(await link.isVisible());
      assert.equal(await link.getAttribute('href'),href);
    }
    await overflow(page);let axeChecks=await accessibility(page);await screenshot(page,`after-home-${width}`);
    await page.locator('#starter-prompts summary').click();
    await page.getByRole('button',{name:'Why did CHANEL need two anomaly detectors?',exact:true}).click();
    assert.equal(await page.locator('#question-input').inputValue(),'Why did CHANEL need two anomaly detectors?');
    assert.equal(await page.locator('.exchange').count(),0,'suggestion submitted before editing');
    for(const [name,path] of [['work','/work/'],['chanel','/case-study-chanel.html'],['forvia','/case-study-forvia.html'],['system','/ai-lexandre-system.html']]) {
      await page.goto(site+path);await page.evaluate(()=>document.fonts.ready);await overflow(page);
      axeChecks+=await accessibility(page);await screenshot(page,`after-${name}-${width}`);
    }
    assert.deepEqual(errors,[]);await context.close();return {axeChecks};
  });
 }

 for(const width of [1280,390]) await check(`real local mock: editable suggestion, roles, streaming, follow-up, citation and return at ${width}px`,async()=>{
  const page=await browser.newPage({viewport:{width,height:width===1280?720:844}});
  const requests=[],endpoints=[];page.on('request',req=>{if(req.url().includes('/v1/interview/')){requests.push(JSON.parse(req.postData()));endpoints.push(new URL(req.url()).pathname);}});
  await page.goto(`${site}/?api=${api}`);await ready(page);
  await page.locator('.role-settings summary').click();await page.locator('#role-picker').selectOption('ml-engineer');await page.locator('.role-settings summary').click();
  await page.locator('#starter-prompts summary').click();
    await page.getByRole('button',{name:'Why did CHANEL need two anomaly detectors?',exact:true}).click();
  await page.locator('#question-input').fill('Why did CHANEL need two anomaly detectors? Explain the tradeoff.');
  await page.locator('#submit-button').click();await page.waitForFunction(()=>document.getElementById('submit-status').textContent.startsWith('Answer ready'));
  assert.equal(requests[0].roleId,'ml-engineer');assert.ok(requests[0].question.includes('Explain the tradeoff'));
  assert.equal(await page.locator('.exchange').count(),1);assert.ok((await page.locator('.answer').innerText()).length>150);
  const evidence=page.locator('.message-details').first();
  assert.equal(await evidence.getAttribute('open'),null);
  const primary=evidence.getByRole('link',{name:'Combination Outlier Detection',includeHidden:true});
  assert.equal(await primary.isVisible(),false);
  assert.equal(await page.getByRole('textbox',{name:'Your reply'}).count(),1);
  await screenshot(page,`after-answer-mock-${width}`);
  await evidence.locator('summary').focus();await page.keyboard.press('Enter');
  assert.equal(await primary.getAttribute('href'),'/assets/projects/Combination_Outlier_Detection.pdf');
  assert.ok(await primary.isVisible());
  const citation=evidence.locator('a[href="/case-study-chanel.html"]').first();await citation.scrollIntoViewIfNeeded();
  const readingY=await page.evaluate(()=>scrollY);
  await citation.click();await page.waitForURL('**/case-study-chanel.html');
  await page.locator('[data-interview-return]').click();await page.waitForURL(url=>url.pathname==='/' && url.searchParams.get('api')===api);await ready(page);await page.evaluate(()=>document.fonts.ready);await delay(100);
  assert.equal(await page.locator('.exchange').count(),1);assert.ok(await page.locator('.message-details').first().getAttribute('open')!==null);
  assert.ok(Math.abs((await page.evaluate(()=>scrollY))-readingY)<8,'reading position not restored');
  assert.equal(await page.locator('#role-picker').inputValue(),'ml-engineer');
  await evidence.locator('summary').click();
  await page.getByRole('button',{name:'Suggested replies'}).click();
  const suggestion=page.locator('#suggested-replies button').first();
  const suggestedText=await suggestion.innerText();
  await suggestion.click();
  assert.equal(await page.locator('#question-input').inputValue(),suggestedText);
  assert.equal(await page.locator('.exchange').count(),1);
  const originalTurn=await page.locator('.exchange').first().elementHandle();
  await page.locator('#question-input').fill('Why?');await page.locator('#question-input').press('Enter');
  await page.waitForFunction(()=>document.getElementById('submit-status').textContent.startsWith('Answer ready'));
  const followUp=requests.at(-1);assert.equal(followUp.history.length,2);assert.ok(followUp.memoryState || followUp.conversationSummary);
  assert.deepEqual(endpoints,['/v1/interview/stream','/v1/interview/stream'],'genuine SSE should not silently use fallback');
  assert.equal(await page.locator('.exchange').count(),2);
  assert.ok(await originalTurn.evaluate(el=>el.isConnected),'sending a reply replaced the earlier turn');
  await screenshot(page,`after-chat-${width}`);
  await page.locator('#clear-thread').click();assert.equal(await page.locator('.exchange').count(),0);
  await page.locator('#undo-clear').click();assert.equal(await page.locator('.exchange').count(),2);
  await page.close();return {mode:'local deterministic mock',requests:requests.length};
 });

 await check('stream failure uses actual local non-streaming fallback',async()=>{
  const page=await browser.newPage();
  await page.route('**/v1/interview/stream',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto(`${site}/?api=${api}`);await ready(page);await page.locator('#question-input').fill('What happens when Zeit cannot fit a task?');await page.locator('#submit-button').click();
  await page.waitForFunction(()=>document.getElementById('submit-status').textContent.startsWith('Answer ready'));
  assert.equal(await page.locator('.exchange').count(),1);assert.ok((await page.locator('.answer').innerText()).length>100);await page.close();
 });

 for(const width of [1280,390,320]) await check(`unavailable service at ${width}px`,async()=>{
  const page=await browser.newPage({viewport:{width,height:width===1280?720:844}});
  await page.route('http://127.0.0.1:9/**',route=>route.abort('connectionrefused'));
  await page.goto(`${site}/?api=http://127.0.0.1:9`);await ready(page);
  assert.ok(await page.locator('#service-notice').isVisible());await overflow(page);await accessibility(page);await screenshot(page,`after-unavailable-${width}`);
  await page.locator('#question-input').fill('My saved question');await page.locator('#submit-button').click();
  await page.waitForFunction(()=>document.getElementById('submit-status').dataset.tone==='danger');
  assert.equal(await page.locator('#question-input').inputValue(),'My saved question');
  await page.close();
 });

 await check('no JavaScript: Work, résumé, projects and career remain reachable',async()=>{
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const page=await context.newPage();
  await page.goto(site);await page.locator('noscript strong').waitFor({state:'visible'});
  assert.equal(await page.locator('.identity-nav a:last-child').getAttribute('href'),'/assets/resume/resume_april.pdf');
  await screenshot(page,'after-no-js-390');await page.locator('.identity-nav a:first-child').click();
  await page.waitForURL('**/work/');assert.ok((await page.locator('#projects').innerText()).includes('CHANEL'));
  assert.ok((await page.locator('#experience').innerText()).includes('68 validated price changes'));assert.equal(await page.locator('#education-0').count(),1);
  await screenshot(page,'after-work-no-js-390');await context.close();
 });

 await check('keyboard flow, draft persistence, legacy anchors and interview alias',async()=>{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto(`${site}/interview/?api=${api}`);await ready(page);
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Skip to interview');
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Browse my work');
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),'Résumé');
  for(const name of ['Email the real me','LinkedIn','GitHub']) {
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').innerText(),name);
  }
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('id'),'question-input');
  assert.notEqual(await page.locator('#interview-form').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await page.keyboard.type('   ');await page.keyboard.press('Enter');
  assert.equal(await page.locator('#question-input').inputValue(),'   ');
  assert.equal(await page.locator('.exchange').count(),0);
  await page.locator('#question-input').fill('');
  await page.keyboard.type('A keyboard question');await page.keyboard.press('Shift+Enter');await page.keyboard.type('with a second line');
  assert.ok((await page.locator('#question-input').inputValue()).includes('\n'));
  await page.reload();await ready(page);assert.ok((await page.locator('#question-input').inputValue()).includes('A keyboard question'));
  await page.goto(`${site}/index.html#experience`);await page.waitForURL('**/work/#experience');await page.close();
 });

 // Long-answer fixture uses published CHANEL facts. It exercises pacing and
 // scrolling; it does not stand in for model-answer quality or live API QA.
 const payload=JSON.parse(await fs.readFile(new URL('../docs/redesign/long-answer-fixture.json',import.meta.url),'utf8'));
 const fixtureServer=http.createServer(async(req,res)=>{
   res.setHeader('Access-Control-Allow-Origin',new URL(site).origin);res.setHeader('Access-Control-Allow-Headers','content-type');
   if(req.method==='OPTIONS'){res.end();return;}
   if(req.url==='/v1/health' || req.url==='/v1/config'){const response=await fetch(api+req.url);res.setHeader('Content-Type','application/json');res.end(await response.text());return;}
   res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.flushHeaders();
   res.write(`data: ${JSON.stringify({type:'meta',projectsUsed:payload.projectsUsed,citations:payload.citations})}\n\n`);
   for(const text of payload.answer.match(/.{1,100}/gs)) {res.write(`data: ${JSON.stringify({type:'token',text})}\n\n`);await delay(80);}
   res.end(`data: ${JSON.stringify({type:'done',payload})}\n\n`);
 });
 await new Promise(resolve=>fixtureServer.listen(8949,'127.0.0.1',resolve));
 try {
  for(const width of [1280,390,320]) await check(`long streamed answer, sources, scroll and reduced motion at ${width}px`,async()=>{
    const page=await browser.newPage({viewport:{width,height:width===1280?720:844},reducedMotion:'reduce'});
    await page.goto(`${site}/?api=http://127.0.0.1:8949`);await ready(page);
    await page.locator('#question-input').fill('Why did CHANEL need two anomaly detectors?');await page.locator('#submit-button').click();
    await page.waitForFunction(()=>document.querySelector('.answer').textContent.length>200);
    assert.equal(await page.locator('#submit-button').getAttribute('aria-busy'),'true');
    assert.equal(await page.locator('.message-details').count(),0);
    assert.equal(await page.locator(':focus').getAttribute('id'),'question-input');
    await page.keyboard.insertText('How did you validate the results?');
    const dock=await page.locator('#interview-form').boundingBox();
    assert.ok(dock.y>=0 && dock.y+dock.height<=page.viewportSize().height,'reply composer is outside the viewport during streaming');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>document.getElementById('submit-status').textContent.startsWith('Answer ready'));
    assert.equal(await page.locator('#question-input').inputValue(),'How did you validate the results?');
    assert.equal(await page.locator(':focus').getAttribute('id'),'question-input');
    assert.ok((await page.evaluate(()=>scrollY))<8,'stream stole the reader scroll position');
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);await overflow(page);await accessibility(page);
    await screenshot(page,`after-long-answer-${width}`);
    await page.locator('.message-details summary').click();
    await page.locator('.evidence-list').scrollIntoViewIfNeeded();
    await screenshot(page,`after-sources-${width}`);await accessibility(page);
    const result={characters:(await page.locator('.answer').innerText()).length,fixture:true};await page.close();return result;
  });
 } finally {await new Promise(resolve=>fixtureServer.close(resolve));}
} finally {
 await browser.close();
 await fs.writeFile(new URL('../docs/redesign/verification.json',import.meta.url),JSON.stringify({results},null,2)+'\n');
}
if(results.some(r=>!r.pass))process.exitCode=1;
