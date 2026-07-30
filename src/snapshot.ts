import { CdpConnection, sendPage } from "./cdp.js";

export interface PageSnapshot {
  url: string;
  title: string;
  text: string;
  links: { text: string; href: string }[];
  headings: { level: number; text: string }[];
  inputs: { selector: string; type: string; value: string; placeholder: string }[];
  buttons: { selector: string; text: string }[];
  meta: Record<string, string>;
  timestamp: string;
}

export async function takeSnapshot(conn: CdpConnection, sessionId: string, pageUrl: string): Promise<PageSnapshot> {
  const r = await sendPage(conn, sessionId, "Runtime.evaluate", {
    expression: `(() => {
      const text = document.body?.innerText || "";
      const links = Array.from(document.querySelectorAll("a[href]")).map(a => ({
        text: a.innerText?.trim() || a.getAttribute("href") || "",
        href: a.href || "",
      }));
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(h => ({
        level: parseInt(h.tagName[1], 10),
        text: h.innerText?.trim() || "",
      }));
      const inputs = Array.from(document.querySelectorAll("input,textarea,select")).map(el => {
        const input = el;
        return {
          selector: [input.id ? "#"+input.id : "", input.name ? "[name='"+input.name+"']" : "", input.type ? "[type='"+input.type+"']" : ""].filter(Boolean).join(""),
          type: input.type || "text",
          value: input.value || "",
          placeholder: input.placeholder || "",
        };
      });
      const buttons = Array.from(document.querySelectorAll("button,[role='button'],input[type='submit'],input[type='button']")).map(b => ({
        selector: b.id ? "#"+b.id : b.className ? "."+b.className.split(" ")[0] : b.tagName.toLowerCase(),
        text: b.innerText?.trim() || b.value || "",
      }));
      const meta = {};
      document.querySelectorAll("meta").forEach(m => {
        const name = m.getAttribute("name") || m.getAttribute("property") || "";
        const content = m.getAttribute("content") || "";
        if (name && content) meta[name] = content;
      });
      return { text, links, headings, inputs, buttons, meta };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  const titleR = await sendPage(conn, sessionId, "Runtime.evaluate", {
    expression: "document.title",
    returnByValue: true,
  });
  const result = r?.result?.value || {};
  const title = titleR?.result?.value || "";

  return {
    url: pageUrl,
    title,
    ...result,
    timestamp: new Date().toISOString(),
  };
}

export function formatSnapshotAsText(snap: PageSnapshot, maxTextLen = 3000): string {
  const lines: string[] = [];
  lines.push(`URL: ${snap.url}`);
  lines.push(`Title: ${snap.title}`);
  lines.push("");

  if (snap.headings && snap.headings.length > 0) {
    lines.push("=== HEADINGS ===");
    for (const h of snap.headings.slice(0, 20)) lines.push(`${"#".repeat(h.level)} ${h.text}`);
    lines.push("");
  }

  if (snap.links && snap.links.length > 0) {
    lines.push("=== LINKS ===");
    for (const ln of snap.links.slice(0, 30)) lines.push(`  ${ln.text} → ${ln.href}`);
    if (snap.links.length > 30) lines.push(`  ... and ${snap.links.length - 30} more`);
    lines.push("");
  }

  if (snap.inputs && snap.inputs.length > 0) {
    lines.push("=== INPUTS ===");
    for (const inp of snap.inputs.slice(0, 20)) lines.push(`  [${inp.type}] ${inp.selector} = "${inp.value}" (placeholder: "${inp.placeholder}")`);
    lines.push("");
  }

  if (snap.buttons && snap.buttons.length > 0) {
    lines.push("=== BUTTONS ===");
    for (const btn of snap.buttons.slice(0, 20)) lines.push(`  ${btn.selector}: "${btn.text}"`);
    lines.push("");
  }

  lines.push("=== PAGE TEXT ===");
  const txt = (snap.text || "").slice(0, maxTextLen);
  lines.push(txt);
  if ((snap.text || "").length > maxTextLen) lines.push(`... (${snap.text.length - maxTextLen} more chars)`);

  return lines.join("\n");
}
