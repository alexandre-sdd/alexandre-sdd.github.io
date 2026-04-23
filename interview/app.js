const FALLBACK_MODE = {
  defaultRoleId: "ai-engineer",
  roles: [],
  seededQuestions: [],
  corpus: {
    chunkCount: 0,
    generatedAt: ""
  }
};

const state = {
  apiBaseUrl: "",
  mode: "unknown",
  config: FALLBACK_MODE,
  selectedRoleId: "ai-engineer",
  history: [],
  lastResponse: null,
  isConnected: false
};

const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const els = {
  apiStatus: qs("#api-status"),
  apiMode: qs("#api-mode"),
  corpusStats: qs("#corpus-stats"),
  apiSettingsForm: qs("#api-settings-form"),
  apiBaseUrl: qs("#api-base-url"),
  useLocalApi: qs("#use-local-api"),
  rolePicker: qs("#role-picker"),
  seededQuestionList: qs("#seeded-question-list"),
  conversation: qs("#conversation"),
  interviewForm: qs("#interview-form"),
  questionInput: qs("#question-input"),
  submitStatus: qs("#submit-status"),
  evidenceState: qs("#evidence-state"),
  citationList: qs("#citation-list"),
  retrievalDebug: qs("#retrieval-debug"),
  projectUsage: qs("#project-usage")
};

function getConfigValue(key) {
  return window.INTERVIEW_CONFIG?.[key];
}

function normalizedApiBase(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const saved = localStorage.getItem("interview_api_base_url");
  return normalizedApiBase(saved || getConfigValue("apiBaseUrl") || getConfigValue("localApiBaseUrl") || "");
}

function apiUrl(path) {
  return `${state.apiBaseUrl}${path}`;
}

function setStatus(message, tone = "default") {
  els.submitStatus.textContent = message;
  els.submitStatus.dataset.tone = tone;
}

function createChip(label, isActive = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${isActive ? " is-active" : ""}`;
  button.textContent = label;
  return button;
}

function createMessage(role, text, options = {}) {
  const article = document.createElement("article");
  article.className = `message message-${role}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "assistant" ? "Alex Agent" : "Interviewer";
  article.appendChild(meta);

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  article.appendChild(body);

  if (options.followUps && options.followUps.length > 0) {
    const row = document.createElement("div");
    row.className = "message-actions";

    options.followUps.forEach((item) => {
      const button = createChip(item);
      button.addEventListener("click", () => {
        els.questionInput.value = item;
        els.questionInput.focus();
      });
      row.appendChild(button);
    });

    article.appendChild(row);
  }

  return article;
}

function renderConversation() {
  els.conversation.innerHTML = "";

  if (state.history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "placeholder-panel";
    empty.textContent = "Start with a seeded recruiter question or write your own.";
    els.conversation.appendChild(empty);
    return;
  }

  state.history.forEach((turn) => {
    els.conversation.appendChild(createMessage(turn.role, turn.content, turn.meta));
  });
  els.conversation.scrollTop = els.conversation.scrollHeight;
}

function renderRolePicker() {
  els.rolePicker.innerHTML = "";

  state.config.roles.forEach((role) => {
    const button = createChip(role.label, role.id === state.selectedRoleId);
    button.title = role.summary;
    button.addEventListener("click", () => {
      state.selectedRoleId = role.id;
      renderRolePicker();
      renderSeededQuestions();
    });
    els.rolePicker.appendChild(button);
  });
}

function renderSeededQuestions() {
  els.seededQuestionList.innerHTML = "";

  const questions = state.config.seededQuestions.filter((item) => item.roleIds.includes(state.selectedRoleId));
  questions.forEach((item) => {
    const button = createChip(item.label);
    button.addEventListener("click", () => {
      els.questionInput.value = item.question;
      els.questionInput.focus();
    });
    els.seededQuestionList.appendChild(button);
  });
}

function renderStatus() {
  els.apiStatus.textContent = state.isConnected ? "Connected" : "Disconnected";
  els.apiMode.textContent = state.mode;
  const generatedAt = state.config.corpus.generatedAt ? new Date(state.config.corpus.generatedAt).toLocaleString() : "n/a";
  els.corpusStats.textContent = `${state.config.corpus.chunkCount} chunks · ${generatedAt}`;
  els.apiBaseUrl.value = state.apiBaseUrl;
}

function renderEvidence(response) {
  state.lastResponse = response;
  els.citationList.innerHTML = "";
  els.projectUsage.innerHTML = "";
  els.retrievalDebug.innerHTML = "";

  if (!response) {
    els.evidenceState.textContent = "Ask a question to inspect citations, project routing, and retrieval traces.";
    return;
  }

  els.evidenceState.textContent = `${response.confidence.toUpperCase()} confidence · ${response.mode} mode`;

  response.projectsUsed.forEach((project) => {
    const item = document.createElement("div");
    item.className = "project-usage-item";
    item.innerHTML = `<strong>${project.title}</strong><span>${project.why}</span>`;
    els.projectUsage.appendChild(item);
  });

  response.citations.forEach((citation) => {
    const card = document.createElement("article");
    card.className = "citation-item";

    const title = document.createElement("a");
    title.className = "citation-title";
    title.textContent = citation.citationLabel;
    title.href = citation.publicUrl;
    title.target = "_blank";
    title.rel = "noreferrer";
    card.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "citation-meta";
    meta.textContent = `${citation.title} · ${citation.section}`;
    card.appendChild(meta);

    const excerpt = document.createElement("p");
    excerpt.textContent = citation.excerpt;
    card.appendChild(excerpt);

    els.citationList.appendChild(card);
  });

  if (getConfigValue("enableRetrievalDebug")) {
    response.retrieval.results.forEach((result) => {
      const row = document.createElement("div");
      row.className = "debug-row";
      row.innerHTML = `
        <strong>${result.title}</strong>
        <span>${result.section}</span>
        <span>Score: ${result.score}</span>
        <span>${result.reasons.join(", ")}</span>
      `;
      els.retrievalDebug.appendChild(row);
    });
  } else {
    els.retrievalDebug.textContent = "Retrieval debug disabled.";
  }
}

async function checkHealth() {
  const response = await fetch(apiUrl("/v1/health"));
  if (!response.ok) throw new Error("Health check failed.");
  return response.json();
}

async function loadConfig() {
  const response = await fetch(apiUrl("/v1/config"));
  if (!response.ok) throw new Error("Config load failed.");
  return response.json();
}

async function reconnect() {
  renderEvidence(null);
  try {
    const [health, config] = await Promise.all([checkHealth(), loadConfig()]);
    state.isConnected = true;
    state.mode = health.mode;
    state.config = config;
    state.selectedRoleId = config.defaultRoleId || state.selectedRoleId;
    renderRolePicker();
    renderSeededQuestions();
    renderStatus();
  } catch (error) {
    state.isConnected = false;
    state.mode = "unreachable";
    state.config = FALLBACK_MODE;
    renderRolePicker();
    renderSeededQuestions();
    renderStatus();
    renderEvidence(null);
    els.evidenceState.textContent = "API unavailable. Start the local server or point this page to Railway.";
    console.error(error);
  }
}

async function askQuestion(question) {
  setStatus("Thinking...");

  const response = await fetch(apiUrl("/v1/interview/respond"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question,
      roleId: state.selectedRoleId,
      history: state.history.map(({ role, content }) => ({ role, content }))
    })
  });

  if (!response.ok) {
    throw new Error("Interview request failed.");
  }

  return response.json();
}

async function handleSubmit(event) {
  event.preventDefault();
  const question = els.questionInput.value.trim();
  if (!question) return;

  state.history.push({
    role: "user",
    content: question
  });
  renderConversation();
  els.questionInput.value = "";

  try {
    const payload = await askQuestion(question);
    state.history.push({
      role: "assistant",
      content: payload.answer,
      meta: {
        followUps: payload.followUps
      }
    });
    renderConversation();
    renderEvidence(payload);
    setStatus("Answer ready.", "success");
  } catch (error) {
    state.history.push({
      role: "assistant",
      content: "The simulator could not reach the API. Check the backend URL or start the local service."
    });
    renderConversation();
    setStatus("Request failed.", "danger");
    console.error(error);
  }
}

function handleApiSettings(event) {
  event.preventDefault();
  state.apiBaseUrl = normalizedApiBase(els.apiBaseUrl.value);
  localStorage.setItem("interview_api_base_url", state.apiBaseUrl);
  reconnect();
}

function bindEvents() {
  els.apiSettingsForm.addEventListener("submit", handleApiSettings);
  els.interviewForm.addEventListener("submit", handleSubmit);
  els.useLocalApi.addEventListener("click", () => {
    state.apiBaseUrl = normalizedApiBase(getConfigValue("localApiBaseUrl") || "http://127.0.0.1:8787");
    localStorage.setItem("interview_api_base_url", state.apiBaseUrl);
    els.apiBaseUrl.value = state.apiBaseUrl;
    reconnect();
  });
}

function seedWelcomeMessage() {
  state.history = [
    {
      role: "assistant",
      content:
        "I answer as Alexandre using grounded portfolio evidence. Pick a role lens, then ask a recruiter-style question and inspect the evidence panel for citations."
    }
  ];
  renderConversation();
}

function init() {
  state.apiBaseUrl = resolveApiBaseUrl();
  bindEvents();
  seedWelcomeMessage();
  renderStatus();
  reconnect();
}

init();
