/* ===========================================================================
   Every user-visible string. One file, so an Uzbek locale is a copy of this
   object rather than a hunt through JSX.

   Rules applied here: sentence case, active voice, name things by what the
   user controls. Errors say what happened AND what to do next. Empty states
   invite an action.
   =========================================================================== */

export const copy = {
  product: {
    name: "Multi-Agent AI Analyst",
    short: "Analyst",
    thesis:
      "One question. A supervisor routes it to the specialists that can answer it, and a critic checks the result before you see it.",
  },

  nav: {
    console: "Console",
    evaluation: "Evaluation",
    setup: "Keys",
    theme: "Switch theme",
    openConsole: "Open the console",
    commandPalette: "Search and commands",
  },

  landing: {
    eyebrow: "Multi-agent analysis, made legible",
    headline: "Watch the work, not just the answer.",
    sub: "Most assistants hand you a paragraph and ask you to trust it. This one shows you which specialist ran, what evidence it produced, and whether the critic let it through.",
    replayLabel: "Live replay",
    replayCaption: "A recorded run, looping. Nothing here is a mock-up of a mock-up — it is the same rail the console draws.",
    agentsTitle: "Six agents, one rail",
    agentsSub: "Each owns one colour. You will learn them in a single run.",
    howTitle: "How a question becomes a verified answer",
    howSteps: [
      { k: "Question", v: "You ask in plain language." },
      { k: "Route", v: "The supervisor picks a specialist." },
      { k: "Tools", v: "It queries, retrieves or computes." },
      { k: "Verify", v: "The critic checks every claim." },
      { k: "Answer", v: "You get the result and its evidence." },
    ],
    ctaNote: "Runs on a recorded stream if no backend is connected.",
  },

  console: {
    title: "Console",
    empty: {
      title: "Ask something that needs more than one source.",
      body: "The interesting questions need a number from the database and a reason from your documents. Try one of these.",
      examplesLabel: "Example questions",
    },
    composer: {
      placeholder: "Ask about churn, pricing, support or the roadmap…",
      send: "Ask",
      stop: "Stop",
      hint: "⌘↵ to send",
    },
    working: (agent: string) => `${agent} is working`,
    routing: "Supervisor is choosing the next specialist",
    verifying: "Critic is checking the answer",
    revisionRunning: (n: number) => `Revision ${n} running`,
    stepBudget: (used: number, max: number) => `Step ${used} of ${max}`,
    stepBudgetHelp:
      "The graph stops at this limit, so a run can never loop forever.",
    railLabel: "Execution rail",
    railAria: "Agent execution steps",
    jumpToRail: "Show me how you got this",
  },

  sidebar: {
    history: "Conversations",
    newRun: "New question",
    documents: "Documents",
    documentsEmpty: "No documents yet.",
    ingestReady: "Indexed",
    ingestPending: "Indexing",
    ingestFailed: "Not indexed",
    database: "Database",
    dbConnected: "Connected, read-only",
    dbMissing: "Not connected",
    agentsTitle: "Agents",
    agentsHelp: "Turn a specialist off and the supervisor will route around it.",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
  },

  panel: {
    title: "Evidence",
    tabs: {
      evidence: "Sources",
      sql: "SQL",
      code: "Code",
      trace: "Trace",
    },
    empty: {
      evidence: "Sources will appear here once the retriever or web agent runs.",
      sql: "The generated query and its result will appear here.",
      code: "Python and its output will appear here.",
      trace: "Timings, tokens and cost will appear here.",
    },
    relevance: "Relevance",
    rowCount: (n: number) => `${n} ${n === 1 ? "row" : "rows"}`,
    stdout: "Output",
    close: "Close panel",
    open: "Open evidence",
    graphTitle: "Graph",
    graphCaption: "Same run, read as a topology.",
  },

  answer: {
    verified: "Verified",
    unverified: "Not verified",
    revised: (n: number) => `Revised ${n}×`,
    criticSaid: "Critic:",
    copy: "Copy answer",
    copied: "Copied",
    export: "Export",
    rerun: "Run again",
    sourcesTitle: "Sources",
  },

  critic: {
    approved: "Critic approved this answer",
    rejected: "Critic sent this back",
    gateOpen: "Gate open",
    gateClosed: "Gate closed",
    branch: (n: number) => `Revision ${n}`,
  },

  errors: {
    sqlRejected: {
      title: "The query was blocked",
      body: "The agent wrote something that was not a read-only SELECT, so it never ran. It will rewrite the query and try once more.",
    },
    codeTimeout: {
      title: "The code ran out of time",
      body: "The sandbox stops any snippet at 15 seconds. The agent will write a simpler calculation.",
    },
    webNoKey: {
      title: "Web search is off",
      body: "Add a Tavily key in Keys to switch it on. Until then the supervisor answers from your documents and database only.",
      action: "Add a key",
    },
    retrievalEmpty: {
      title: "No matching sources",
      body: "Your documents are indexed but nothing matched this question. Try naming the document, or index more material.",
    },
    backendDown: {
      title: "No backend connected",
      body: "Showing a recorded run so you can see how the console behaves. Set NEXT_PUBLIC_API_URL to connect a live one.",
    },
    generic: {
      title: "The run stopped",
      body: "Something failed mid-run. The trace below shows the last step that completed.",
    },
  },

  evaluation: {
    title: "Evaluation",
    sub: "RAGAS metrics and an LLM judge over a fixed test set, scored twice: with the critic and without it. The gap between the two is the whole argument for having a critic.",
    deltaLabel: "Delta",
    withCritic: "With critic",
    withoutCritic: "Without critic",
    metricsTitle: "Metrics",
    failuresTitle: "Failures worth reading",
    failuresSub:
      "Every wrong answer, tagged with the node that caused it and the change that fixed it.",
    columns: {
      metric: "Metric",
      with: "With critic",
      without: "Without critic",
      delta: "Delta",
      question: "Question",
      culprit: "Node at fault",
      what: "What happened",
      fix: "Fix",
    },
  },

  setup: {
    title: "API keys",
    sub: "Keys stay in this browser. They are sent to your own backend and nowhere else.",
    storedLocally: "Stored in this browser only, never on our servers.",
    required: "Required",
    optional: "Optional",
    save: "Save keys",
    saved: "Saved",
    clear: "Clear",
    show: "Show",
    hide: "Hide",
    status: {
      set: "Set",
      unset: "Not set",
      invalid: "Looks wrong",
    },
    keys: {
      gemini: {
        label: "Google Gemini",
        help: "Powers the language model and the embeddings. Free, no card.",
        placeholder: "AIza…",
      },
      qdrant: {
        label: "Qdrant",
        help: "Stores your indexed documents. Leave blank to use the local store.",
        placeholder: "https://…qdrant.io:6333",
      },
      tavily: {
        label: "Tavily",
        help: "Turns on the Web agent. Without it the agent stays off and says so.",
        placeholder: "tvly-…",
      },
      langfuse: {
        label: "Langfuse",
        help: "Records a trace of every run for debugging and cost.",
        placeholder: "pk-lf-…",
      },
    },
  },

  a11y: {
    railLive: "Agent activity",
    stationExpand: (agent: string) => `Show what ${agent} produced`,
    stationCollapse: (agent: string) => `Hide what ${agent} produced`,
    activeStep: (agent: string) => `${agent} is running`,
    skipToContent: "Skip to content",
  },
} as const;

export type Copy = typeof copy;
