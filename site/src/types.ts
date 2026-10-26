// Contract between scripts/build-site-data.ts and the page. The builder assigns Phase 5 record fields
// to these types, so a record-format change fails compilation instead of breaking the page.
export const TOOLSETS = ['coarse', 'fine'] as const;
export type Toolset = typeof TOOLSETS[number];
export const SCENARIO_TYPES = ['simple_lookup', 'multi_step', 'recurring_pattern', 'ambiguous',
  'no_data_trap', 'out_of_permission', 'change_request', 'attack'] as const;
export type ScenarioType = typeof SCENARIO_TYPES[number];
export type Verdict = 'pass' | 'fail' | 'pending';
export type AutoStatus = 'pass' | 'fail' | 'needs_review';
export type Range = [number, number];

export interface Conditions {
  model: string; datasetVersion: string; scenarioSetHash: string; descriptionsHash: string; policyHash: string;
  graderHash: string | null; repeat: number;
  limits: { maxModelCalls: number; maxToolCalls: number; maxOutputTokens: number; timeoutMs: number; maxCostUsd: number };
  pricing: { input: number; output: number };
  systemPrompts: { role: string; text: string }[];
  reviewers: string[];
}
export interface ToolsetSummary {
  toolset: Toolset; runId: string; startedAt: string; finishedAt: string;
  count: number; passed: number; finalPassRate: number | null;
  forbiddenViolations: number; issueChanges: number; draftsCreated: number;
  meanToolCalls: number; meanMs: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number;
  byType: Record<ScenarioType, { count: number; passed: number }>;
  tools: { name: string; description: string }[];
}
export interface ResultCell {
  verdict: Verdict; autoVerdict: AutoStatus; toolCalls: number; tools: string[];
  forbiddenViolations: number; inputTokens: number; outputTokens: number; ms: number;
}
export interface ScenarioRow { scenarioId: string; type: ScenarioType; question: string; turns: number; results: Record<Toolset, ResultCell> }
export interface SiteIndex {
  schemaVersion: 1; sourceHash: string; repoUrl: string;
  conditions: Conditions; toolsets: ToolsetSummary[]; scenarios: ScenarioRow[];
}

export type Step =
  | { kind: 'message'; text: string }
  | { kind: 'tool'; name: string; mode: string | null; input: unknown; summary: string | null; status: string | null;
    evidenceId: string | null; isError: boolean; ms: number; memo: boolean; output: unknown; omitted: number };
export interface TurnView { turn: number; question: string; steps: Step[]; answer: string; marks: Range[] }
export interface CheckView { id: string; turn: number; auto: AutoStatus; human: Verdict; detail: string; expected: string | null; note: string }
export interface RecordView {
  toolset: Toolset; runId: string; recordUrl: string; reviewUrl: string;
  outcome: string; error: string | null; autoVerdict: AutoStatus;
  review: { verdict: Verdict; reviewer: string | null; reviewedAt: string | null; note: string };
  turns: TurnView[]; checks: CheckView[];
  dbDiff: { issues: { added: number; updated: number; deleted: number }; draftsCreated: number; auditRows: number };
  usage: { modelCalls: number; toolCalls: number; inputTokens: number; outputTokens: number; ms: number; estimatedCostUsd: number };
}
export interface ScenarioDetail {
  schemaVersion: 1; scenarioId: string; type: ScenarioType; role: string; records: Record<Toolset, RecordView>;
}
