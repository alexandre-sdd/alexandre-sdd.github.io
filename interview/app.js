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
  messages: [],
  isConnected: false,
  isStreaming: false,
  messageCounter: 0,
  showDevControls: false
};

const STREAM_RENDER_DELAY_MS = 22;
const MAX_HISTORY_MESSAGES = 8;
const SUMMARY_SOURCE_LIMIT = 5;
const PROCESS_STEPS = {
  retrieve: "Finding relevant portfolio evidence.",
  ground: "Preparing source-backed context.",
  draft: "Writing the answer from retrieved evidence.",
  sources: "Checking the source links for this answer."
};
const PROCESS_TIMELINE = [
  { delay: 500, step: PROCESS_STEPS.ground },
  { delay: 1300, step: PROCESS_STEPS.draft }
];

const qs = (selector, scope = document) => scope.querySelector(selector);
const params = new URLSearchParams(window.location.search);

const els = {
  rolePicker: qs("#role-picker"),
  conversation: qs("#conversation"),
  interviewForm: qs("#interview-form"),
  questionInput: qs("#question-input"),
  submitStatus: qs("#submit-status"),
  submitButton: qs("#submit-button"),
  clearThread: qs("#clear-thread"),
  devPanel: qs("#dev-panel"),
  devStatus: qs("#dev-status")
};

function getConfigValue(key) {
  return window.INTERVIEW_CONFIG?.[key];
}

function normalizedApiBase(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const fromQuery = params.get("api");
  if (fromQuery) return normalizedApiBase(fromQuery);

  localStorage.removeItem("interview_api_base_url");
  return normalizedApiBase(getConfigValue("apiBaseUrl") || getConfigValue("localApiBaseUrl") || "");
}

function apiUrl(path) {
  return `${state.apiBaseUrl}${path}`;
}

function nextMessageId() {
  state.messageCounter += 1;
  return `msg-${state.messageCounter}`;
}

function setStatus(message, tone = "default") {
  els.submitStatus.textContent = message;
  els.submitStatus.dataset.tone = tone;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function featuredRoles() {
  const featuredIds = getConfigValue("featuredRoleIds") || [];
  const featured = state.config.roles.filter((role) => featuredIds.includes(role.id));
  return featured.length > 0 ? featured : state.config.roles.slice(0, 3);
}

function selectedRole() {
  return featuredRoles().find((role) => role.id === state.selectedRoleId) || featuredRoles()[0] || null;
}

function starterQuestions() {
  const currentRole = selectedRole();
  const count = getConfigValue("starterQuestionCount") || 3;
  if (!currentRole) return [];

  return state.config.seededQuestions
    .filter((item) => item.roleIds.includes(currentRole.id))
    .slice(0, count);
}

function createPresetButton(role) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `preset-button${role.id === state.selectedRoleId ? " is-active" : ""}`;
  button.textContent = role.label;
  button.title = role.summary;
  button.addEventListener("click", () => {
    state.selectedRoleId = role.id;
    updatePromptPlaceholder();
    renderRolePicker();
    renderConversation();
  });
  return button;
}

function createFollowUpChip(text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "follow-up-chip";
  button.textContent = text;
  button.addEventListener("click", () => {
    els.questionInput.value = text;
    els.questionInput.focus();
  });
  return button;
}

function sourceTypeLabel(sourceType) {
  const labels = {
    "case-study": "Case study",
    education: "Education",
    experience: "Experience",
    overview: "Overview",
    project: "Project",
    skills: "Skills"
  };

  return labels[sourceType] || "Source";
}

function createSources(message) {
  if ((!message.projectsUsed || message.projectsUsed.length === 0) && (!message.citations || message.citations.length === 0)) {
    return null;
  }

  const footer = document.createElement("div");
  footer.className = "message-footer";

  if (message.projectsUsed?.length) {
    const row = document.createElement("div");
    row.className = "source-row";

    message.projectsUsed.forEach((source) => {
      const link = document.createElement(source.publicUrl ? "a" : "span");
      link.className = "source-chip";
      link.textContent = source.sourceType && source.sourceType !== "project" ? `${sourceTypeLabel(source.sourceType)}: ${source.title}` : source.title;
      link.title = source.why ? `${sourceTypeLabel(source.sourceType)} · ${source.why}` : sourceTypeLabel(source.sourceType);
      if (source.publicUrl) {
        link.href = source.publicUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
      }
      row.appendChild(link);
    });

    footer.appendChild(row);
  }

  if (message.followUps?.length) {
    const followUpRow = document.createElement("div");
    followUpRow.className = "follow-up-row";
    message.followUps.slice(0, 2).forEach((item) => followUpRow.appendChild(createFollowUpChip(item)));
    footer.appendChild(followUpRow);
  }

  if (message.citations?.length) {
    const details = document.createElement("details");
    details.className = "message-details";
    const summary = document.createElement("summary");
    summary.textContent = "Source basis";
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "evidence-list";

    message.citations.forEach((citation) => {
      const item = document.createElement("article");
      item.className = "evidence-item";
      const title = document.createElement("a");
      title.href = citation.publicUrl;
      title.target = "_blank";
      title.rel = "noreferrer";
      title.textContent = citation.citationLabel;
      item.appendChild(title);

      const excerpt = document.createElement("p");
      excerpt.textContent = citation.excerpt;
      item.appendChild(excerpt);

      list.appendChild(item);
    });

    details.appendChild(list);
    footer.appendChild(details);
  }

  return footer;
}

function createMessageElement(message) {
  const article = document.createElement("article");
  article.className = `message message-${message.role}${message.isStreaming ? " is-streaming" : ""}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = message.role === "assistant" ? "Alex" : "Interviewer";
  article.appendChild(meta);

  if (message.role === "assistant" && message.processStep) {
    const process = document.createElement("div");
    process.className = "message-process";
    process.textContent = `Process: ${message.processStep}`;
    article.appendChild(process);
  }

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = message.content;
  article.appendChild(body);

  if (message.role === "assistant") {
    const sources = createSources(message);
    if (sources) article.appendChild(sources);
  }

  return article;
}

function createEmptyState() {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const card = document.createElement("div");
  card.className = "empty-state-card";

  const heading = document.createElement("h2");
  heading.textContent = "Start like an interviewer";
  card.appendChild(heading);

  const copy = document.createElement("p");
  copy.textContent = "Ask for exact role, technical judgment, tradeoffs, outcomes, and what I would improve next.";
  card.appendChild(copy);

  const promptRow = document.createElement("div");
  promptRow.className = "starter-prompts";

  starterQuestions().forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "starter-button";
    button.textContent = item.question;
    button.addEventListener("click", () => {
      els.questionInput.value = item.question;
      els.questionInput.focus();
    });
    promptRow.appendChild(button);
  });

  card.appendChild(promptRow);
  wrapper.appendChild(card);

  return wrapper;
}

function renderRolePicker() {
  els.rolePicker.innerHTML = "";
  featuredRoles().forEach((role) => els.rolePicker.appendChild(createPresetButton(role)));
}

function renderConversation() {
  els.conversation.innerHTML = "";

  if (state.messages.length === 0) {
    els.conversation.appendChild(createEmptyState());
    return;
  }

  state.messages.forEach((message) => {
    els.conversation.appendChild(createMessageElement(message));
  });

  els.conversation.scrollTop = els.conversation.scrollHeight;
}

function renderDevPanel() {
  if (!state.showDevControls) {
    els.devPanel.classList.add("is-hidden");
    return;
  }

  els.devPanel.classList.remove("is-hidden");
  els.devStatus.textContent = `API: ${state.apiBaseUrl || "unset"} · mode: ${state.mode} · connected: ${state.isConnected ? "yes" : "no"}`;
}

function updatePromptPlaceholder() {
  const role = selectedRole();
  const placeholders = {
    "ai-engineer": "Ask what I built, why the architecture worked, and what failure mode I handled.",
    "ml-engineer": "Ask what data decision, evaluation choice, or production constraint mattered most.",
    "optimization-analytics": "Ask what constraint, solver choice, or scheduling tradeoff changed the answer."
  };

  els.questionInput.placeholder = placeholders[role?.id] || "Ask what my exact role was, what tradeoff mattered, or why the work fits.";
}

function setStreamingState(isStreaming) {
  state.isStreaming = isStreaming;
  els.submitButton.disabled = isStreaming;
  els.questionInput.disabled = isStreaming;
}

function upsertMessage(id, updater) {
  const message = state.messages.find((item) => item.id === id);
  if (!message) return;
  updater(message);
  renderConversation();
}

function setMessageProcess(messageId, step) {
  upsertMessage(messageId, (message) => {
    message.processStep = step;
  });
}

function startProcessTimeline(messageId) {
  const timers = PROCESS_TIMELINE.map(({ delay, step }) =>
    window.setTimeout(() => {
      setMessageProcess(messageId, step);
    }, delay)
  );

  return () => timers.forEach((timer) => window.clearTimeout(timer));
}

async function flushStreamQueue(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message || message.streamFlushActive) return;

  message.streamFlushActive = true;

  while (true) {
    const current = state.messages.find((item) => item.id === messageId);
    if (!current) break;

    if (current.streamQueue && current.streamQueue.length > 0) {
      current.content += current.streamQueue.shift();
      current.isStreaming = true;
      renderConversation();
      await wait(STREAM_RENDER_DELAY_MS);
      continue;
    }

    if (current.finalPayload) {
      current.content = current.finalPayload.answer;
      current.citations = current.finalPayload.citations;
      current.projectsUsed = current.finalPayload.projectsUsed;
      current.followUps = current.finalPayload.followUps;
      current.isStreaming = false;
      current.processStep = null;
      current.finalPayload = null;
      current.streamFlushActive = false;
      renderConversation();
      return;
    }

    current.streamFlushActive = false;
    renderConversation();
    return;
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
  try {
    const [health, config] = await Promise.all([checkHealth(), loadConfig()]);
    state.isConnected = true;
    state.mode = health.mode;
    state.config = config;

    const currentFeatured = featuredRoles();
    if (!currentFeatured.some((role) => role.id === state.selectedRoleId)) {
      state.selectedRoleId = currentFeatured[0]?.id || config.defaultRoleId || state.selectedRoleId;
    }

    renderRolePicker();
    renderConversation();
    updatePromptPlaceholder();
    setStatus("");
  } catch (error) {
    state.isConnected = false;
    state.mode = "unreachable";
    state.config = FALLBACK_MODE;
    renderRolePicker();
    renderConversation();
    setStatus("The interview service is unavailable.", "danger");
    console.error(error);
  }

  renderDevPanel();
}

function readNdjsonLine(line) {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function buildConversationMemory() {
  const completeMessages = state.messages.filter((message) => message.content && !message.isStreaming);
  const history = completeMessages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content
  }));
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

async function streamQuestion(question, assistantId, memory) {
  const response = await fetch(apiUrl("/v1/interview/stream"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question,
      roleId: state.selectedRoleId,
      history: memory.history,
      conversationSummary: memory.conversationSummary
    })
  });

  if (!response.ok || !response.body) {
    throw new Error("Streaming unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const event = readNdjsonLine(line);
      if (!event) continue;

      if (event.type === "meta") {
        upsertMessage(assistantId, (message) => {
          message.projectsUsed = event.projectsUsed;
          message.citations = event.citations;
          message.processStep = PROCESS_STEPS.ground;
        });
      }

      if (event.type === "token") {
        upsertMessage(assistantId, (message) => {
          if (!message.streamQueue) message.streamQueue = [];
          message.streamQueue.push(event.text);
          message.isStreaming = true;
          message.processStep = PROCESS_STEPS.draft;
        });
        void flushStreamQueue(assistantId);
      }

      if (event.type === "done") {
        upsertMessage(assistantId, (message) => {
          message.finalPayload = event.payload;
          message.processStep = PROCESS_STEPS.sources;
        });
        void flushStreamQueue(assistantId);
        state.mode = event.payload.mode;
      }

      if (event.type === "error") {
        throw new Error(event.message || "Stream failed.");
      }
    }
  }
}

async function askQuestion(question, memory) {
  const response = await fetch(apiUrl("/v1/interview/respond"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question,
      roleId: state.selectedRoleId,
      history: memory.history,
      conversationSummary: memory.conversationSummary
    })
  });

  if (!response.ok) {
    throw new Error("Interview request failed.");
  }

  return response.json();
}

async function submitQuestion(question) {
  const memory = buildConversationMemory();

  const userMessage = {
    id: nextMessageId(),
    role: "user",
    content: question
  };

  const assistantMessage = {
    id: nextMessageId(),
    role: "assistant",
    content: "",
    citations: [],
    projectsUsed: [],
    followUps: [],
    processStep: PROCESS_STEPS.retrieve,
    isStreaming: true
  };

  state.messages.push(userMessage, assistantMessage);
  renderConversation();
  setStreamingState(true);
  setStatus("Streaming...");
  const stopProcessTimeline = startProcessTimeline(assistantMessage.id);

  try {
    await streamQuestion(question, assistantMessage.id, memory);
    setStatus("", "success");
  } catch (streamError) {
    try {
      setStatus("Preparing answer...");
      const payloadPromise = askQuestion(question, memory);
      setMessageProcess(assistantMessage.id, PROCESS_STEPS.ground);
      await wait(260);
      setMessageProcess(assistantMessage.id, PROCESS_STEPS.draft);
      const payload = await payloadPromise;
      setMessageProcess(assistantMessage.id, PROCESS_STEPS.sources);
      await wait(260);
      upsertMessage(assistantMessage.id, (message) => {
        message.content = payload.answer;
        message.citations = payload.citations;
        message.projectsUsed = payload.projectsUsed;
        message.followUps = payload.followUps;
        message.isStreaming = false;
        message.processStep = null;
        message.streamQueue = [];
        message.finalPayload = null;
      });
      state.mode = payload.mode;
      await wait(1200);
      setStatus("", "success");
    } catch (error) {
      upsertMessage(assistantMessage.id, (message) => {
        message.content = "The interview service could not answer right now.";
        message.isStreaming = false;
        message.processStep = null;
        message.streamQueue = [];
        message.finalPayload = null;
      });
      setStatus("Request failed.", "danger");
      console.error(error);
    }
    console.error(streamError);
  } finally {
    stopProcessTimeline();
    setStreamingState(false);
    renderDevPanel();
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isStreaming) return;

  const question = els.questionInput.value.trim();
  if (!question) return;

  els.questionInput.value = "";
  await submitQuestion(question);
}

function handleKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.interviewForm.requestSubmit();
  }
}

function clearThread() {
  if (state.isStreaming) return;
  state.messages = [];
  renderConversation();
  setStatus("");
}

function bindEvents() {
  els.interviewForm.addEventListener("submit", handleSubmit);
  els.questionInput.addEventListener("keydown", handleKeydown);
  els.clearThread.addEventListener("click", clearThread);
}

function init() {
  state.apiBaseUrl = resolveApiBaseUrl();
  state.showDevControls = params.has("dev") || Boolean(getConfigValue("showDevControls"));

  bindEvents();
  updatePromptPlaceholder();
  reconnect();
}

init();
