import type { ArtifactsRowMessage, ZoeaArtifact } from "./actions";

interface ArtifactSentinel {
  name?: string;
  relative_path?: string;
  media_type?: string | null;
  bytes?: number;
  metadata?: Record<string, unknown> | null;
}

interface ResultSentinel {
  run_id?: string;
  artifacts?: ArtifactSentinel[];
}

interface ZoeaDetails {
  version?: number;
  run_id?: string;
  results?: ResultSentinel[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readZoeaDetails(result: unknown): ZoeaDetails | null {
  if (!isRecord(result)) return null;
  const details = result["details"];
  if (!isRecord(details)) return null;
  const zoea = details["zoea"];
  if (!isRecord(zoea)) return null;
  return zoea as ZoeaDetails;
}

// Builds a server-relative URL for an artifact. The proxy in vite.config
// forwards /v1/* to whichever zoea-server is configured, and the prod
// nginx config does the same.
export function buildArtifactUrl(sessionId: string, runId: string, name: string): string {
  const path = name.split("/").map(encodeURIComponent).join("/");
  return `/v1/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(runId)}/${path}`;
}

export function extractArtifactsFromResult(
  result: unknown,
  toolCallId: string,
  sessionId: string,
): ZoeaArtifact[] {
  const zoea = readZoeaDetails(result);
  if (!zoea || zoea.version !== 1 || !Array.isArray(zoea.results) || !sessionId) return [];
  const artifacts: ZoeaArtifact[] = [];
  zoea.results.forEach((res, resultIndex) => {
    const runId = res?.run_id || zoea.run_id;
    if (!runId || !Array.isArray(res?.artifacts)) return;
    for (const a of res.artifacts) {
      if (!a?.name || !a?.relative_path) continue;
      artifacts.push({
        toolCallId,
        resultIndex,
        runId,
        name: a.name,
        relativePath: a.relative_path,
        mediaType: a.media_type ?? undefined,
        bytes: typeof a.bytes === "number" ? a.bytes : 0,
        metadata: a.metadata ?? undefined,
        url: buildArtifactUrl(sessionId, runId, a.name),
      });
    }
  });
  return artifacts;
}

// Walks a hydrated transcript looking for tool-result messages whose
// content carries Zoea artifact metadata. Pi's raw transcript shape
// puts the extension's `details` payload inside the toolResult content.
// We accept both `output.details.zoea` (Pi's structured form) and a
// bare `details.zoea` (defensive).
export function extractArtifactsFromTranscript(
  messages: readonly { role: string; toolCallId?: string; output?: unknown; details?: unknown }[] | unknown[],
  sessionId: string,
): ArtifactsRowMessage[] {
  if (!sessionId) return [];
  const rows: ArtifactsRowMessage[] = [];
  for (const raw of messages) {
    if (!isRecord(raw)) continue;
    if (raw["role"] !== "toolResult") continue;
    const toolCallId = typeof raw["toolCallId"] === "string" ? raw["toolCallId"] : "";
    if (!toolCallId) continue;
    const candidates: unknown[] = [];
    if (raw["output"] !== undefined) candidates.push(raw["output"]);
    if (raw["result"] !== undefined) candidates.push(raw["result"]);
    candidates.push(raw);
    let artifacts: ZoeaArtifact[] = [];
    for (const candidate of candidates) {
      artifacts = extractArtifactsFromResult(candidate, toolCallId, sessionId);
      if (artifacts.length > 0) break;
    }
    if (artifacts.length === 0) continue;
    rows.push({
      role: "zoeaArtifacts",
      toolCallId,
      artifacts,
      createdAt: new Date().toISOString(),
    });
  }
  return rows;
}
