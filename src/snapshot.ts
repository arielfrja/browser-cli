import type { Page } from "puppeteer-core";

export interface PageSnapshot {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  text: string;
  links: { text: string; href: string }[];
  headings: { level: number; text: string }[];
  inputs: { selector: string; type: string; value: string; placeholder: string }[];
  buttons: { selector: string; text: string }[];
  meta: Record<string, string>;
  timestamp: string;
}

export async function takeSnapshot(page: Page): Promise<PageSnapshot> {
  const result = await page.evaluate(() => {
    // Text content
    const text = document.body?.innerText || "";

    // Links
    const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
      text: (a as HTMLElement).innerText?.trim() || a.getAttribute("href") || "",
      href: (a as HTMLAnchorElement).href || "",
    }));

    // Headings
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, h5, h6")
    ).map((h) => ({
      level: parseInt(h.tagName[1], 10),
      text: (h as HTMLElement).innerText?.trim() || "",
    }));

    // Inputs
    const inputs = Array.from(document.querySelectorAll("input, textarea, select")).map(
      (el) => {
        const input = el as HTMLInputElement;
        return {
          selector: [
            input.id ? `#${input.id}` : "",
            input.name ? `[name="${input.name}"]` : "",
            input.type ? `[type="${input.type}"]` : "",
          ]
            .filter(Boolean)
            .join(""),
          type: input.type || "text",
          value: input.value || "",
          placeholder: input.placeholder || "",
        };
      }
    );

    // Buttons
    const buttons = Array.from(
      document.querySelectorAll("button, [role='button'], input[type='submit'], input[type='button']")
    ).map((b) => ({
      selector: (b as HTMLElement).id
        ? `#${(b as HTMLElement).id}`
        : (b as HTMLElement).className
        ? `.${(b as HTMLElement).className.split(" ")[0]}`
        : b.tagName.toLowerCase(),
      text: (b as HTMLElement).innerText?.trim() || (b as HTMLInputElement).value || "",
    }));

    // Meta tags
    const meta: Record<string, string> = {};
    document.querySelectorAll("meta").forEach((m) => {
      const name = m.getAttribute("name") || m.getAttribute("property") || "";
      const content = m.getAttribute("content") || "";
      if (name && content) meta[name] = content;
    });

    return { text, links, headings, inputs, buttons, meta };
  });

  return {
    url: page.url(),
    title: await page.title(),
    viewport: page.viewport() || { width: 1280, height: 720 },
    ...result,
    timestamp: new Date().toISOString(),
  };
}

export function formatSnapshotAsText(snap: PageSnapshot, maxTextLen = 3000): string {
  const lines: string[] = [];
  lines.push(`URL: ${snap.url}`);
  lines.push(`Title: ${snap.title}`);
  lines.push(`Viewport: ${snap.viewport.width}x${snap.viewport.height}`);
  lines.push("");

  if (snap.headings.length > 0) {
    lines.push("=== HEADINGS ===");
    for (const h of snap.headings.slice(0, 20)) {
      lines.push(`${"#".repeat(h.level)} ${h.text}`);
    }
    lines.push("");
  }

  if (snap.links.length > 0) {
    lines.push("=== LINKS ===");
    for (const ln of snap.links.slice(0, 30)) {
      lines.push(`  ${ln.text} → ${ln.href}`);
    }
    if (snap.links.length > 30) lines.push(`  ... and ${snap.links.length - 30} more`);
    lines.push("");
  }

  if (snap.inputs.length > 0) {
    lines.push("=== INPUTS ===");
    for (const inp of snap.inputs.slice(0, 20)) {
      lines.push(
        `  [${inp.type}] ${inp.selector} = "${inp.value}" (placeholder: "${inp.placeholder}")`
      );
    }
    lines.push("");
  }

  if (snap.buttons.length > 0) {
    lines.push("=== BUTTONS ===");
    for (const btn of snap.buttons.slice(0, 20)) {
      lines.push(`  ${btn.selector}: "${btn.text}"`);
    }
    lines.push("");
  }

  lines.push("=== PAGE TEXT ===");
  const txt = snap.text.slice(0, maxTextLen);
  lines.push(txt);
  if (snap.text.length > maxTextLen) lines.push(`... (${snap.text.length - maxTextLen} more chars)`);

  return lines.join("\n");
}
