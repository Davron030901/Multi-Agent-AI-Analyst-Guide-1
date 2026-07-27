export type NodeName =
  | "supervisor"
  | "retriever"
  | "web"
  | "data"
  | "code"
  | "generate"
  | "critic";

export interface Source {
  type: "document" | "web" | "sql" | "code" | string;
  title?: string;
  url?: string;
  source?: string;
  snippet?: string;
}

export interface StepEvent {
  type: "step";
  node: NodeName;
  steps: string[];
  detail: string;
  plan?: string | null;
}

export interface FinalEvent {
  type: "final";
  answer: string;
  steps: string[];
  sources: Source[];
  revisions: number;
  sql_result?: string | null;
  code_result?: string | null;
}

export interface StartEvent {
  type: "start";
  question: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent = StartEvent | StepEvent | FinalEvent | ErrorEvent;

export interface TraceEntry {
  node: NodeName;
  detail: string;
  at: number;
}

export interface Turn {
  id: string;
  question: string;
  answer: string;
  trace: TraceEntry[];
  steps: string[];
  sources: Source[];
  revisions: number;
  sqlResult?: string | null;
  codeResult?: string | null;
  status: "streaming" | "done" | "error";
  error?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  llm_ready: boolean;
  llm_error?: string | null;
  provider: string;
  model: string;
  capabilities: {
    web_search: boolean;
    tracing: boolean;
    database: boolean;
    qdrant: string;
  };
  langfuse: string;
}
