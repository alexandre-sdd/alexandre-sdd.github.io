import type { RolePreset, SeededQuestion } from "./types.js";

export const DEFAULT_ROLE_ID = "ai-engineer";

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "ai-engineer",
    label: "AI Engineer",
    summary: "Grounded product builder for LLM systems, APIs, and end-to-end AI workflows.",
    recruiterLens: "Focus on system architecture, orchestration, shipping instincts, and evidence-backed AI work.",
    answerStyle: "Lead with shipped systems, then explain architecture, tradeoffs, and reliability choices.",
    priorityProjectIds: ["ai-lexandre", "tomorrow-you", "codebase-analyzer", "linkedin-note-copilot"],
    keywords: ["llm", "agent", "voice", "api", "product", "automation", "fastapi", "next.js", "typescript"]
  },
  {
    id: "ml-engineer",
    label: "ML Engineer",
    summary: "Applied ML candidate with production data workflows, anomaly detection, and modeling depth.",
    recruiterLens: "Focus on data pipelines, model choices, evaluation thinking, and operational constraints.",
    answerStyle: "Connect modeling work to deployment realities and measurable outcomes.",
    priorityProjectIds: ["ai-lexandre", "tomorrow-you", "helpfullens", "chanel-europe-analytics-pipeline"],
    keywords: ["machine learning", "anomaly", "forecasting", "pipeline", "evaluation", "feature engineering"]
  },
  {
    id: "research-engineer",
    label: "Research Engineer",
    summary: "Bridges mathematical rigor, experiments, and implementation across AI and operations research.",
    recruiterLens: "Focus on experimental design, technical depth, and translating research ideas into working systems.",
    answerStyle: "Emphasize hypotheses, constraints, methodology, and what was learned from experiments.",
    priorityProjectIds: [
      "appointment-scheduling-dynamics",
      "childcare-deserts-nyc",
      "dna-plasmid-closure",
      "forvia-camera-radar-fusion-prototype"
    ],
    keywords: ["research", "simulation", "optimization", "experiment", "scientific", "validation"]
  },
  {
    id: "product-data-scientist",
    label: "Product / Data Scientist",
    summary: "Builds decision-support tools with a strong eye for product framing and stakeholder value.",
    recruiterLens: "Focus on user needs, prioritization, tradeoffs, and evidence of turning models into tools.",
    answerStyle: "Tie technical decisions to user impact, stakeholder adoption, and product clarity.",
    priorityProjectIds: ["ai-lexandre", "zeit-project", "tomorrow-you", "linkedin-note-copilot"],
    keywords: ["decision support", "stakeholder", "product", "dashboard", "workflow", "adoption"]
  },
  {
    id: "optimization-analytics",
    label: "Optimization / Analytics",
    summary: "Operations research and planning candidate with optimization, scheduling, and simulation depth.",
    recruiterLens: "Focus on formulation quality, constraints, policy tradeoffs, and applied decision support.",
    answerStyle: "Explain the business or policy problem, the model, and why the constraints mattered.",
    priorityProjectIds: ["zeit-project", "childcare-deserts-nyc", "appointment-scheduling-dynamics"],
    keywords: ["optimization", "simulation", "scheduling", "gurobi", "or-tools", "policy", "operations"]
  }
];

export const SEEDED_QUESTIONS: SeededQuestion[] = [
  {
    id: "ai-depth",
    label: "AI depth",
    question: "What should I take as your strongest AI engineering signal?",
    roleIds: ["ai-engineer", "ml-engineer"],
    expectedProjectIds: ["ai-lexandre", "tomorrow-you", "codebase-analyzer"],
    intent: "technical"
  },
  {
    id: "system-design",
    label: "System design",
    question: "Walk me through one AI system as if I were evaluating architecture: inputs, orchestration, failures, and output.",
    roleIds: ["ai-engineer", "ml-engineer"],
    expectedProjectIds: ["ai-lexandre", "tomorrow-you", "codebase-analyzer"],
    intent: "technical"
  },
  {
    id: "failure-handling",
    label: "Failures",
    question: "Pick one failure mode you actually had to design around. What did you change?",
    roleIds: ["ai-engineer", "ml-engineer", "research-engineer"],
    expectedProjectIds: ["tomorrow-you", "chanel-europe-analytics-pipeline", "forvia-camera-radar-fusion-prototype"],
    intent: "technical"
  },
  {
    id: "stakeholder-example",
    label: "Stakeholders",
    question: "Give me an example where stakeholder constraints changed your technical plan.",
    roleIds: ["product-data-scientist", "ml-engineer", "optimization-analytics"],
    expectedProjectIds: [
      "chanel-europe-analytics-pipeline",
      "zeit-project",
      "appointment-scheduling-dynamics",
      "Junior CentraleSupelec (JCS) – Nantes University Hospital:Data & Operations Consultant (Healthcare Planning & Forecasting)",
      "CHANEL Europe, Advanced Analytics & Data Science:Data Scientist"
    ],
    intent: "behavioral"
  },
  {
    id: "shipping-fast",
    label: "Shipping fast",
    question: "Tell me about a time you shipped something quickly without sacrificing too much quality.",
    roleIds: ["ai-engineer", "product-data-scientist"],
    expectedProjectIds: ["tomorrow-you", "zeit-project", "linkedin-note-copilot"],
    intent: "behavioral"
  },
  {
    id: "best-fit",
    label: "Best fit",
    question: "If I only remember one reason you fit this role, what should it be?",
    roleIds: ["ai-engineer"],
    expectedProjectIds: ["ai-lexandre", "tomorrow-you", "codebase-analyzer"],
    intent: "role-fit"
  },
  {
    id: "compare-projects",
    label: "Compare projects",
    question: "Compare two of your projects that show different sides of your technical profile.",
    roleIds: ["ai-engineer", "research-engineer", "product-data-scientist"],
    expectedProjectIds: ["tomorrow-you", "appointment-scheduling-dynamics", "zeit-project"],
    intent: "comparison"
  },
  {
    id: "data-quality",
    label: "Data quality",
    question: "Tell me about your most production-relevant data quality or anomaly detection work.",
    roleIds: ["ml-engineer", "product-data-scientist"],
    expectedProjectIds: ["chanel-europe-analytics-pipeline", "helpfullens"],
    intent: "technical"
  },
  {
    id: "optimization-tradeoffs",
    label: "Optimization tradeoffs",
    question: "Which project best shows how you think about optimization or scheduling tradeoffs?",
    roleIds: ["optimization-analytics", "research-engineer"],
    expectedProjectIds: ["zeit-project", "appointment-scheduling-dynamics", "childcare-deserts-nyc"],
    intent: "technical"
  },
  {
    id: "research-rigor",
    label: "Research rigor",
    question: "Describe a project where experimental rigor mattered as much as implementation.",
    roleIds: ["research-engineer"],
    expectedProjectIds: ["forvia-camera-radar-fusion-prototype", "appointment-scheduling-dynamics", "dna-plasmid-closure"],
    intent: "technical"
  },
  {
    id: "ambiguity",
    label: "Ambiguity",
    question: "Tell me about a time you operated with incomplete information or evolving requirements.",
    roleIds: ["ai-engineer", "product-data-scientist", "optimization-analytics"],
    expectedProjectIds: [
      "chanel-europe-analytics-pipeline",
      "appointment-scheduling-dynamics",
      "Junior CentraleSupelec (JCS) – Nantes University Hospital:Data & Operations Consultant (Healthcare Planning & Forecasting)",
      "CHANEL Europe, Advanced Analytics & Data Science:Data Scientist"
    ],
    intent: "behavioral"
  },
  {
    id: "future-growth",
    label: "Growth edge",
    question: "What technical area are you actively improving right now, and which of your projects shows that direction?",
    roleIds: ["ai-engineer", "research-engineer", "ml-engineer"],
    expectedProjectIds: ["ai-lexandre", "codebase-analyzer", "appointment-scheduling-dynamics", "tomorrow-you"],
    intent: "role-fit"
  }
];

export const ROLE_PRESET_MAP = new Map(ROLE_PRESETS.map((preset) => [preset.id, preset]));
