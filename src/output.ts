/**
 * Output formatter for AI agents.
 * Text-only models get plain text.
 * Multimodal agents get text + base64 image references.
 */

export interface AgentOutput {
  text: string;
  screenshot?: string; // base64 PNG
  snapshot?: string;   // structured text snapshot
  success: boolean;
  duration: number;
}

export function formatAgentOutput(params: {
  message: string;
  screenshotBase64?: string;
  snapshotText?: string;
  success?: boolean;
  startTime: number;
}): string {
  const elapsed = Date.now() - params.startTime;
  const lines: string[] = [];

  lines.push(`<!-- browser-cli result: ${params.success !== false ? "OK" : "FAIL"} (${elapsed}ms) -->`);

  if (params.snapshotText) {
    lines.push("");
    lines.push("--- PAGE SNAPSHOT ---");
    lines.push(params.snapshotText);
  }

  lines.push("");
  lines.push(params.message);

  if (params.screenshotBase64) {
    lines.push("");
    lines.push("--- SCREENSHOT (base64) ---");
    lines.push(params.screenshotBase64);
    // Also output as markdown image for multimodal agents
    lines.push("");
    lines.push("![page-screenshot](data:image/png;base64," + params.screenshotBase64 + ")");
  }

  return lines.join("\n");
}

export function formatError(err: unknown, startTime: number): string {
  const elapsed = Date.now() - startTime;
  const msg = err instanceof Error ? err.message : String(err);
  return `<!-- browser-cli result: FAIL (${elapsed}ms) -->\n\nERROR: ${msg}`;
}
