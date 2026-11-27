import { evidenceUrl } from './urls.js';

const MAX_HISTORY_MESSAGES = 8;
const SUMMARY_SOURCE_LIMIT = 5;
const STORAGE_KEY = 'ai-lexandre-conversation-v1';
const params = new URLSearchParams(location.search);
const localRoles = [
  {id:'ai-engineer',label:'AI Engineer',summary:'Architecture, shipping, and reliable AI systems.'},
  {id:'ml-engineer',label:'ML Engineer',summary:'Data decisions, evaluation, and operational constraints.'},
  {id:'optimization-analytics',label:'Optimization / Analytics',summary:'Formulations, constraints, scheduling, and policy tradeoffs.'},
  {id:'research-engineer',label:'Research Engineer',summary:'Experiments, methodology, and research implementation.'},
  {id:'product-data-scientist',label:'Product / Data Scientist',summary:'User needs, stakeholder decisions, and product tradeoffs.'}
];
const state = {apiBaseUrl:'',apiOverride:'',mode:'unknown',roles:localRoles,selectedRoleId:'ai-engineer',messages:[],isStreaming:false,isConnected:false,messageCounter:0,scrollY:0,details:[],undo:null};
const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['interview','conversation','interview-form','question-input','question-label','submit-status','submit-button','submit-label','clear-thread','undo-clear','suggest-reply','suggested-replies','role-picker','role-summary','role-description','composer-tools','starter-prompts','service-notice','reconnect','dev-panel','dev-status'].map(id=>[id,$(id)]));
const devMode = params.has('dev') || Boolean(window.INTERVIEW_CONFIG?.showDevControls);
let streamRender = 0;

function storeSession() {
  try {
    sessionStorage.setItem('ai-lexandre-return-url',location.pathname+location.search);
    state.details=[...document.querySelectorAll('.message-details[open]')].map(el=>el.id);
    sessionStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,messages:state.messages,selectedRoleId:state.selectedRoleId,messageCounter:state.messageCounter,draft:els['question-input'].value,scrollY:window.scrollY,apiOverride:state.apiOverride,details:[...document.querySelectorAll('.message-details[open]')].map(el=>el.id)}));
  } catch { /* The interview still works with storage blocked or full. */ }
}

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.version !== 1 || !Array.isArray(saved.messages)) return;
    state.messages = saved.messages.filter(m=>m && ['user','assistant'].includes(m.role) && typeof m.content==='string' && typeof m.id==='string').map(m=>({...m,isStreaming:false,interrupted:m.isStreaming || m.interrupted}));
    state.selectedRoleId = saved.selectedRoleId || state.selectedRoleId;
    state.messageCounter = Number(saved.messageCounter) || state.messages.length;
    state.scrollY = Number(saved.scrollY) || 0;
    state.details = Array.isArray(saved.details) ? saved.details : [];
    state.apiOverride = saved.apiOverride || '';
    els['question-input'].value = typeof saved.draft==='string' ? saved.draft : '';
  } catch { /* Ignore older, invalid, or unavailable storage. */ }
}

function status(text='',tone='default') {
  els['submit-status'].textContent = text;
  els['submit-status'].dataset.tone = tone;
  els['submit-status'].classList.toggle('sr-only', state.messages.length > 0 && tone === 'default');
}

function renderControls() {
  const inChat = state.messages.length > 0;
  els.interview.classList.toggle('in-chat', inChat);
  els['question-input'].placeholder = inChat ? 'Reply to AI-lexandre…' : 'What would you like to know?';
  els['question-input'].rows = inChat ? 1 : 2;
  els['question-label'].textContent = inChat ? 'Your reply' : 'Your question';
  els['question-label'].classList.toggle('sr-only', inChat);
  els['submit-button'].disabled = state.isStreaming;
  els['submit-button'].setAttribute('aria-busy',String(state.isStreaming));
  els['submit-label'].textContent = state.isStreaming ? 'Answering' : inChat ? 'Send' : 'Ask';
  els['clear-thread'].disabled = state.isStreaming;
  els['clear-thread'].hidden = state.messages.length===0;
  els['undo-clear'].hidden = !state.undo;
  els['role-picker'].disabled = state.isStreaming;
  els['starter-prompts'].hidden = state.messages.length>0;
  els['service-notice'].hidden = state.isConnected || state.mode==='unknown';
  els['dev-panel'].hidden = !devMode;
  els['dev-status'].textContent = `API: ${state.apiBaseUrl} · mode: ${state.mode}`;
}

function renderRoles() {
  els['role-picker'].replaceChildren();
  for (const role of state.roles) {
    const option = document.createElement('option');
    option.value=role.id;option.textContent=role.label;
    els['role-picker'].append(option);
  }
  if (!state.roles.some(r=>r.id===state.selectedRoleId)) state.selectedRoleId=state.roles[0]?.id || 'ai-engineer';
  els['role-picker'].value=state.selectedRoleId;
  const role=state.roles.find(r=>r.id===state.selectedRoleId);
  els['role-summary'].textContent=`Role focus: ${role?.label || 'AI Engineer'}`;
  els['role-description'].textContent=role?.summary || '';
}

function element(tag,className,text) {
  const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;
}

function setAnswer(body,text) {
  const fragment=document.createDocumentFragment();
  for (const paragraph of text.split(/\n\s*\n/).filter(Boolean)) {
    const p=element('p');
    // Interpret emphasis only; model output never becomes executable HTML.
    for (const [i,part] of paragraph.split(/\*\*(.*?)\*\*/g).entries()) p.append(i%2?element('strong','',part):document.createTextNode(part));
    fragment.append(p);
  }
  body.replaceChildren(fragment);
}

function sourceLink(url,title) {
  const href=evidenceUrl(url);if(!href)return null;
  const link=element('a','',title);link.href=href;
  // Navigate normally so Back restores this exact reading position.
  link.addEventListener('click',storeSession);
  return link;
}

function evidenceFor(message) {
  const entries=[];
  for(const source of message.projectsUsed || []) {
    const url=evidenceUrl(source.publicUrl);if(!url)continue;
    entries.push({url,title:source.title,description:source.why || 'Published portfolio evidence'});
  }
  for(const citation of message.citations || []) {
    const url=evidenceUrl(citation.publicUrl);if(!url)continue;
    const existing=entries.find(e=>e.url===url);
    if(existing) {if(!existing.excerpt)existing.excerpt=citation.excerpt;continue;}
    entries.push({url,title:citation.citationLabel || 'Published evidence',excerpt:citation.excerpt});
  }
  const chanel=entries.find(e=>/case-study-chanel|Combination_Outlier_Detection/.test(e.url));
  if(chanel) {
    // This is the public method document behind the cited CHANEL case study.
    const note={url:'/assets/projects/Combination_Outlier_Detection.pdf',title:'Combination Outlier Detection',description:'CHANEL · public method note. Company data and code are confidential.'};
    if(/chanel|craft|combination_outlier/i.test(`${entries[0].title} ${entries[0].url}`)) entries.unshift(note);
    else entries.push(note);
  }
  const seen=new Set();
  return entries.filter(e=>{if(seen.has(e.url))return false;seen.add(e.url);return true;});
}

function fillQuestion(text) {
  els['question-input'].value=text;
  els['question-input'].focus();
  storeSession();
}

function appendReplyDetails(article, message) {
  const entries = evidenceFor(message);
  if (entries.length) {
    const details = element('details', 'message-details');
    details.id = `evidence-${message.id}`;
    details.open = state.details.includes(details.id);
    const summary = element('summary', '', `${entries.length} ${entries.length === 1 ? 'source' : 'sources'}`);
    const list = element('ul', 'evidence-list');
    for (const entry of entries) {
      const item = element('li');
      item.append(sourceLink(entry.url, entry.title));
      const description = entry.excerpt || entry.description;
      if (description) item.append(element('p', '', description));
      list.append(item);
    }
    details.append(summary, list);
    details.addEventListener('toggle', storeSession);
    article.append(details);
  }
  if (devMode && message.memoryState) {
    const details = element('details');
    details.append(element('summary', '', 'Routing'), element('pre', 'routing-trace', JSON.stringify(message.memoryState, null, 2)));
    article.append(details);
  }
}

function renderSuggestedReplies() {
  const latest = state.messages.at(-1);
  const suggestions = latest?.role === 'assistant' && !latest.isStreaming ? latest.followUps || [] : [];
  const list = els['suggested-replies'];
  list.hidden = true;
  list.replaceChildren();
  els['suggest-reply'].hidden = !suggestions.length;
  els['suggest-reply'].setAttribute('aria-expanded', 'false');
  for (const text of suggestions.slice(0, 2)) {
    const button = element('button', 'starter-button', text);
    button.type = 'button';
    button.addEventListener('click', () => {
      list.hidden = true;
      els['suggest-reply'].setAttribute('aria-expanded', 'false');
      fillQuestion(text);
    });
    list.append(button);
  }
}

function appendExchange(question, answer) {
  const exchange = element('section', 'exchange');
  exchange.id = question.id;
  const heading = element('h2', 'question');
  heading.append(element('span', 'sr-only', 'You: '), document.createTextNode(question.content));
  exchange.append(heading);
  if (answer?.role === 'assistant') {
    const article = element('div', 'assistant-message');
    article.id = answer.id;
    article.setAttribute('aria-busy', String(answer.isStreaming));
    const avatar = element('img', 'chat-avatar');
    avatar.src = '/assets/portrait.jpg';
    avatar.alt = '';
    const author = element('p', 'answer-label', 'AI-lexandre');
    const body = element('div', 'answer');
    setAnswer(body, answer.content);
    article.append(avatar, author, body);
    if (!answer.isStreaming) finishReplyView(article, answer);
    exchange.append(article);
  }
  els.conversation.append(exchange);
}

function finishReplyView(article, answer) {
  if (answer.interrupted) {
    article.append(element('p', 'reply-note', 'Reply interrupted. You can send the question again.'));
  }
  appendReplyDetails(article, answer);
}

function renderConversation() {
  els.conversation.replaceChildren();
  for (let i = 0; i < state.messages.length; i++) {
    if (state.messages[i].role === 'user') appendExchange(state.messages[i], state.messages[i + 1]);
  }
  renderSuggestedReplies();
  renderControls();
}

function renderStream(message) {
  if(streamRender)return;
  streamRender=requestAnimationFrame(()=>{
    streamRender=0;
    const article=$(message.id);if(!article)return;
    setAnswer(article.querySelector('.answer'),message.content);
    // Never scroll on token arrival. The reader owns the page position.
  });
}

async function reconnect() {
  els.reconnect.disabled=true;
  try {
    const [healthResponse,configResponse]=await Promise.all([
      fetch(`${state.apiBaseUrl}/v1/health`,{signal:AbortSignal.timeout(6000)}),
      fetch(`${state.apiBaseUrl}/v1/config`,{signal:AbortSignal.timeout(6000)})
    ]);
    if(!healthResponse.ok || !configResponse.ok)throw new Error('Interview unavailable');
    const [health,config]=await Promise.all([healthResponse.json(),configResponse.json()]);
    state.mode=health.mode;
    if(config.roles?.length)state.roles=config.roles;
    state.isConnected=true;
    if(!state.isStreaming)status();
  } catch {
    state.isConnected=false;state.mode='unreachable';
    if(!state.isStreaming)status('You can browse the work below or try the service again.');
  } finally {
    renderRoles();renderControls();els.reconnect.disabled=false;
  }
}

function nextMessageId() {state.messageCounter+=1;return `msg-${state.messageCounter}`;}

function requestBody(question,memory) {
  return JSON.stringify({question,roleId:state.selectedRoleId,history:memory.history,conversationSummary:memory.conversationSummary,memoryState:memory.memoryState});
}

function finishAnswer(message,payload) {
  if(typeof payload?.answer!=='string')throw new Error('Incomplete interview answer');
  Object.assign(message,{content:payload.answer,citations:payload.citations || [],projectsUsed:payload.projectsUsed || [],followUps:payload.followUps || [],memoryState:payload.memoryState,isStreaming:false,interrupted:false});
  state.mode=payload.mode;state.isConnected=true;
}

async function streamQuestion(question,message,memory) {
  const response=await fetch(`${state.apiBaseUrl}/v1/interview/stream`,{method:'POST',headers:{'Content-Type':'application/json'},body:requestBody(question,memory),signal:AbortSignal.timeout(90000)});
  if(!response.ok || !response.body)throw new Error('Streaming unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',finished=false;
  function handleFrame(frame) {
    const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data)return;
    const event=JSON.parse(data);
    if(event.type==='meta') {message.projectsUsed=event.projectsUsed || [];message.citations=event.citations || [];}
    if(event.type==='token') {message.content+=event.text || '';renderStream(message);}
    if(event.type==='done') {finishAnswer(message,event.payload);finished=true;}
    if(event.type==='error')throw new Error('Stream failed');
  }
  try {
    while(true) {
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value,{stream:!done});
      const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop() || '';
      for(const frame of frames)handleFrame(frame);
      if(done) {if(buffer.trim())handleFrame(buffer);break;}
    }
    if(!finished)throw new Error('Stream ended before completion');
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}

async function submitQuestion(question) {
  const memory=buildConversationMemory();
  const user={id:nextMessageId(),role:'user',content:question};
  const assistant={id:nextMessageId(),role:'assistant',content:'',citations:[],projectsUsed:[],followUps:[],isStreaming:true};
  state.messages.push(user,assistant);state.isStreaming=true;state.undo=null;
  appendExchange(user,assistant);renderSuggestedReplies();renderControls();status('Answering…');storeSession();
  // One movement in direct response to submitting, never on later tokens.
  els['question-input'].focus({preventScroll:true});
  $(user.id).scrollIntoView({block:'start',behavior:'instant'});
  try {
    try {await streamQuestion(question,assistant,memory);}
    catch {
      status('Trying the standard response…');
      const response=await fetch(`${state.apiBaseUrl}/v1/interview/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:requestBody(question,memory),signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw new Error('Interview unavailable');
      finishAnswer(assistant,await response.json());
    }
    status('Answer ready.');
  } catch {
    assistant.isStreaming=false;assistant.interrupted=true;
    if(!assistant.content)assistant.content='The interview service couldn’t answer right now. Your question is saved; try again or browse the published work.';
    state.isConnected=false;state.mode='unreachable';
    if(!els['question-input'].value)els['question-input'].value=question;
    status('The service is unavailable. Try your question again or browse my work.','danger');
  } finally {
    if(streamRender){cancelAnimationFrame(streamRender);streamRender=0;}
    const article = $(assistant.id);
    setAnswer(article.querySelector('.answer'), assistant.content);
    finishReplyView(article, assistant);
    article.setAttribute('aria-busy', 'false');
    state.isStreaming=false;renderSuggestedReplies();renderControls();storeSession();
  }
}

function bindEvents() {
  els['interview-form'].addEventListener('submit',event=>{
    event.preventDefault();if(state.isStreaming)return;
    const question=els['question-input'].value.trim();if(!question)return;
    els['question-input'].value='';void submitQuestion(question);
  });
  els['question-input'].addEventListener('keydown',event=>{
    if(event.key==='Enter' && !event.shiftKey && !event.isComposing && !state.isStreaming) {event.preventDefault();els['interview-form'].requestSubmit();}
  });
  els['question-input'].addEventListener('input',storeSession);
  els['role-picker'].addEventListener('change',()=>{state.selectedRoleId=els['role-picker'].value;renderRoles();storeSession();});
  document.querySelectorAll('.starter-button').forEach(button=>{button.disabled=false;button.addEventListener('click',()=>fillQuestion(button.textContent));});
  els.reconnect.addEventListener('click',reconnect);
  els['suggest-reply'].addEventListener('click', () => {
    const list = els['suggested-replies'];
    list.hidden = !list.hidden;
    els['suggest-reply'].setAttribute('aria-expanded', String(!list.hidden));
  });
  els['clear-thread'].addEventListener('click',()=>{
    if(state.isStreaming)return;
    state.undo=state.messages;state.messages=[];state.details=[];renderConversation();status('New conversation. You can undo this.');storeSession();els['question-input'].focus();
  });
  els['undo-clear'].addEventListener('click',()=>{if(!state.undo)return;state.messages=state.undo;state.undo=null;renderConversation();status('Conversation restored.');storeSession();});
  window.addEventListener('pagehide',storeSession);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)storeSession();});
  let savingScroll=false;
  window.addEventListener('scroll',()=>{if(savingScroll)return;savingScroll=true;requestAnimationFrame(()=>{storeSession();savingScroll=false;});},{passive:true});
}

function init() {
  restoreSession();
  state.apiOverride=params.get('api') || state.apiOverride;
  state.apiBaseUrl=(state.apiOverride || window.INTERVIEW_CONFIG?.apiBaseUrl || window.INTERVIEW_CONFIG?.localApiBaseUrl || '').trim().replace(/\/+$/,'');
  if('scrollRestoration' in history)history.scrollRestoration='manual';
  els['question-input'].disabled=false;els['composer-tools'].hidden=false;
  bindEvents();renderRoles();renderConversation();
  // Give restored text its final font metrics before restoring the reading position.
  const restoreY=state.scrollY;
  Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,800))]).then(()=>requestAnimationFrame(()=>window.scrollTo({top:restoreY,behavior:'instant'})));
  void reconnect();
}

// Compact memory builder is shared with the previous client protocol.
function buildConversationMemory() {
  const completeMessages = state.messages.filter((message) => message.content && !message.isStreaming);
  const history = completeMessages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content
  }));

  // Use structured memoryState from the most recent assistant response when available
  const lastMemoryState = [...completeMessages]
    .reverse()
    .find((message) => message.role === "assistant" && message.memoryState)
    ?.memoryState;

  if (lastMemoryState) {
    return { history, memoryState: lastMemoryState };
  }

  // Legacy: build string conversationSummary for older server versions
  const olderMessages = completeMessages.slice(0, Math.max(0, completeMessages.length - MAX_HISTORY_MESSAGES));
  const assistantMessages = completeMessages.filter((message) => message.role === "assistant");
  const latestSources =
    [...assistantMessages].reverse().find((message) => message.projectsUsed?.length)?.projectsUsed || [];
  const sourceTitles = [];

  latestSources.forEach((source) => {
    if (source?.title && !sourceTitles.includes(source.title)) {
      sourceTitles.push(source.title);
    }
  });

  const summaryParts = [];
  if (sourceTitles.length) {
    summaryParts.push(`Recent sources in order: ${sourceTitles.slice(0, SUMMARY_SOURCE_LIMIT).map((title, index) => `${index + 1}. ${title}`).join("; ")}.`);
  }
  if (olderMessages.length) {
    const earlierTopics = olderMessages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .slice(-3)
      .join(" | ");
    if (earlierTopics) summaryParts.push(`Earlier interviewer topics: ${earlierTopics}.`);
  }

  return {
    history,
    conversationSummary: summaryParts.join(" ").slice(0, 1600)
  };
}


init();
