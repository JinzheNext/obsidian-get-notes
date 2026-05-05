import { HTMLElement, parse } from "node-html-parser";
import TurndownService from "turndown";
import { inferLegacyNoteKind, LegacyAttachmentRef, LegacyNoteKind, LegacyNoteModel } from "./render";

export class LegacyGetCore {
  memos: Record<string, string>[];
  tags: string[];
  files: Record<string, string[]>;
  syncedNoteIds: string[];
  newMemosCount = 0;
  notes: LegacyNoteModel[];
  allTags: string[];

  constructor(notesData: Map<string, string>, syncedNoteIds: string[] = []) {
    this.syncedNoteIds = [...syncedNoteIds];
    this.files = {};
    this.notes = [];
    this.allTags = [];
    this.loadNotes(notesData);
    this.memos = this.notes.map((note) => ({
      title: note.title,
      date: note.date,
      content: note.bodyMarkdown,
      id: note.id,
    }));
    this.tags = this.allTags;
  }

  private loadNotes(notesData: Map<string, string>): void {
    const turndown = new TurndownService({ bulletListMarker: "-" });
    turndown.addRule("audio", {
      filter: "audio",
      replacement: (_content: string, node: any) => {
        const source = node.querySelector("source");
        const src = source?.getAttribute("src");
        if (!src?.startsWith("files/")) return "";
        return `![[${src.replace("files/", "")}]]`;
      },
    });
    turndown.addRule("getImage", {
      filter: (node: any) => node.nodeName === "IMG",
      replacement: (_content: string, node: any) => {
        const imgNode = node as unknown as HTMLElement;
        const src = imgNode.getAttribute("src") || "";
        const alt = imgNode.getAttribute("alt") || "";
        if (!src.startsWith("files/")) return `![${alt}](${src})`;
        return `![${alt}](<${src.replace("files/", "")}>)`;
      },
    });

    for (const [filename, htmlContent] of notesData) {
      const noteId = filename.replace(/\.html$/, "");
      const note = this.parseNote(noteId, htmlContent, turndown);
      if (!note) continue;
      this.notes.push(note);
      this.newMemosCount += 1;
      if (!this.syncedNoteIds.includes(noteId)) this.syncedNoteIds.push(noteId);
      for (const tag of note.tags) {
        if (!this.allTags.includes(tag)) this.allTags.push(tag);
      }
    }
  }

  private parseNote(
    noteId: string,
    htmlContent: string,
    turndown: InstanceType<typeof TurndownService>,
  ): LegacyNoteModel | null {
    try {
      const root = parse(htmlContent);
      const noteEl = root.querySelector(".note");
      if (!noteEl) return null;

      const titleEl = root.querySelector("title");
      const h1El = noteEl.querySelector("h1");
      const title = h1El?.textContent?.trim() || titleEl?.textContent?.trim() || "Untitled";

      let dateTime = "";
      let date = "";
      for (const paragraph of noteEl.querySelectorAll("p")) {
        const text = paragraph.textContent || "";
        const match = text.match(/创建于[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
        if (!match) continue;
        date = match[1];
        dateTime = `${match[1]} ${match[2]}`;
        break;
      }
      if (!date) {
        const now = new Date();
        date = now.toISOString().split("T")[0];
        dateTime = `${date} 00:00:00`;
      }

      const tags = noteEl.querySelectorAll(".tag").map((tag) => tag.textContent?.trim()).filter(Boolean) as string[];
      const attachments: LegacyAttachmentRef[] = [];
      for (const audio of noteEl.querySelectorAll("audio source")) {
        const src = audio.getAttribute("src");
        if (src) attachments.push({ source: src, type: "audio" });
      }
      for (const img of noteEl.querySelectorAll("img")) {
        const src = img.getAttribute("src");
        if (src?.startsWith("files/")) attachments.push({ source: src, type: "image" });
      }
      const externalLinks = noteEl
        .querySelectorAll("a")
        .map((anchor) => ({
          title: anchor.textContent?.trim() || "未命名链接",
          url: anchor.getAttribute("href") || "",
        }))
        .filter((item) => /^https?:\/\//.test(item.url));
      for (const link of externalLinks) {
        attachments.push({ source: link.url, type: "link", title: link.title, url: link.url });
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

      let bodyMarkdown = turndown.turndown(contentEl.toString());
      bodyMarkdown = bodyMarkdown.replace(/\\\\\[/g, "[").replace(/\\\\\]/g, "]");
      bodyMarkdown = bodyMarkdown.replace(/GETIMPORTERHIGHLIGHTMARKPLACEHOLDER/g, "==").trim();

      const noteBase: LegacyNoteModel = {
        id: noteId,
        title,
        date,
        dateTime,
        tags,
        bodyMarkdown,
        attachments,
        noteKind: "plain_text" as LegacyNoteKind,
        externalLinks,
      };
      noteBase.noteKind = inferLegacyNoteKind(noteBase);
      return noteBase;
    } catch (error) {
      console.error(`[Get Notes][legacy] parse note failed`, noteId, error);
      return null;
    }
  }
}
