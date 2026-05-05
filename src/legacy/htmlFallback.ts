import path from "path";
import { HTMLElement, parse } from "node-html-parser";
import TurndownService from "turndown";
import { Asset, CanonicalNoteType } from "../types";
import { dedupeAssets, dedupeStrings, normalizeCanonicalType, normalizeText, nullIfEmpty, toTimestamp } from "../canonical/common";

export interface LegacyHtmlFallbackNote {
  id: string;
  title: string;
  type: CanonicalNoteType;
  createdAt: number | null;
  updatedAt: number | null;
  summary: string | null;
  body: string | null;
  reference: string | null;
  tags: string[];
  notebook: string | null;
  assets: {
    audios: Asset[];
    images: Asset[];
    files: Asset[];
    links: string[];
  };
}

function inferLegacyType(input: { title: string; bodyMarkdown: string; audios: Asset[]; links: string[] }): CanonicalNoteType {
  const text = `${input.title}\n${input.bodyMarkdown}`;
  const peopleMatch = text.match(/参与人数[：:]\s*约?\s*(\d+)/);
  const peopleCount = peopleMatch ? Number.parseInt(peopleMatch[1], 10) : 0;
  const looksLikeMeeting = /####\s*会议信息|会议总结|多人|讨论|参会|会议/.test(text) || peopleCount >= 2;
  if (looksLikeMeeting && input.audios.length > 0) return "meeting";
  if (input.audios.length > 0) return "audio";
  if (input.links.length > 0) return "link";
  return "text";
}

function buildTurndown(): InstanceType<typeof TurndownService> {
  const turndown = new TurndownService({ bulletListMarker: "-" });
  turndown.addRule("audio", {
    filter: "audio",
    replacement: (_content: string, node: any) => {
      const source = node.querySelector("source");
      const src = source?.getAttribute("src");
      if (!src?.startsWith("files/")) return "";
      return `![[${src.replace("files/", "")}]]`;
    }
  });
  turndown.addRule("getImage", {
    filter: (node: any) => node.nodeName === "IMG",
    replacement: (_content: string, node: any) => {
      const imgNode = node as unknown as HTMLElement;
      const src = imgNode.getAttribute("src") || "";
      const alt = imgNode.getAttribute("alt") || "";
      if (!src.startsWith("files/")) return `![${alt}](${src})`;
      return `![${alt}](<${src.replace("files/", "")}>)`;
    }
  });
  return turndown;
}

export function parseLegacyHtmlFallback(noteId: string, htmlContent: string): LegacyHtmlFallbackNote | null {
  try {
    const root = parse(htmlContent);
    const noteEl = root.querySelector(".note");
    if (!noteEl) return null;

    const titleEl = root.querySelector("title");
    const h1El = noteEl.querySelector("h1");
    const title = normalizeText(h1El?.textContent || titleEl?.textContent || "Untitled") || "Untitled";

    let dateTime = "";
    for (const paragraph of noteEl.querySelectorAll("p")) {
      const text = paragraph.textContent || "";
      const match = text.match(/创建于[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
      if (!match) continue;
      dateTime = `${match[1]} ${match[2]}`;
      break;
    }

    const tags = dedupeStrings(noteEl.querySelectorAll(".tag").map((tag) => tag.textContent?.trim() || ""));
    const audios: Asset[] = [];
    const images: Asset[] = [];
    const files: Asset[] = [];
    const externalLinks: string[] = [];

    for (const source of noteEl.querySelectorAll("audio source")) {
      const src = normalizeText(source.getAttribute("src"));
      if (!src.startsWith("files/")) continue;
      const ext = path.extname(src).replace(/^\./, "") || "mp3";
      audios.push({ kind: "audio", source: src, title: path.basename(src), ext });
    }

    for (const img of noteEl.querySelectorAll("img")) {
      const src = normalizeText(img.getAttribute("src"));
      if (!src.startsWith("files/")) continue;
      const ext = path.extname(src).replace(/^\./, "") || "png";
      images.push({ kind: "image", source: src, title: img.getAttribute("alt") || path.basename(src), ext });
    }

    for (const anchor of noteEl.querySelectorAll("a")) {
      const href = normalizeText(anchor.getAttribute("href"));
      const titleText = normalizeText(anchor.textContent || "") || path.basename(href);
      if (/^https?:\/\//.test(href)) {
        externalLinks.push(href);
        continue;
      }
      if (href.startsWith("files/")) {
        const ext = path.extname(href).replace(/^\./, "") || undefined;
        files.push({ kind: "file", source: href, title: titleText || path.basename(href), ext });
      }
    }

    const contentEl = parse(noteEl.toString());
    for (const h1 of contentEl.querySelectorAll("h1")) h1.remove();
    for (const p of contentEl.querySelectorAll("p")) {
      const text = p.textContent || "";
      if (text.includes("创建于") || text.includes("标签：")) p.remove();
    }
    const firstHr = contentEl.querySelector("hr");
    if (firstHr) firstHr.remove();
    for (const attachment of contentEl.querySelectorAll(".attachment")) {
      if (attachment.querySelector("audio")) attachment.remove();
    }

    const turndown = buildTurndown();
    const bodyMarkdown = normalizeText(
      turndown
        .turndown(contentEl.toString())
        .replace(/\\\\\[/g, "[")
        .replace(/\\\\\]/g, "]")
        .replace(/GETIMPORTERHIGHLIGHTMARKPLACEHOLDER/g, "==")
    );

    const type = inferLegacyType({
      title,
      bodyMarkdown,
      audios,
      links: externalLinks
    });
    const reference = externalLinks.length ? externalLinks.map((url) => `- ${url}`).join("\n") : null;

    return {
      id: noteId,
      title,
      type: normalizeCanonicalType(type),
      createdAt: toTimestamp(dateTime),
      updatedAt: toTimestamp(dateTime),
      summary: type === "audio" || type === "meeting" ? nullIfEmpty(bodyMarkdown) : null,
      body: type === "audio" || type === "meeting" ? null : nullIfEmpty(bodyMarkdown),
      reference,
      tags,
      notebook: null,
      assets: {
        audios: dedupeAssets(audios),
        images: dedupeAssets(images),
        files: dedupeAssets(files),
        links: dedupeStrings(externalLinks)
      }
    };
  } catch (_error) {
    return null;
  }
}
