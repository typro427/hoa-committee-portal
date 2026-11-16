// Parser for Zoom AI Companion meeting notes ("Quick recap", "Next steps", "Summary").
// Works on text extracted from Zoom's PDF export, on text copied from the Zoom summary email
// or Zoom Docs, and degrades gracefully for anything else (the whole text becomes one block).

export type ZoomTopic = { title: string | null; body: string };
export type ZoomAction = { owner: string | null; text: string };
export type ParsedZoomNotes = {
  title: string | null;
  recap: string | null;
  topics: ZoomTopic[];
  actions: ZoomAction[];
  recognized: boolean; // true when Zoom's section headings were found
};

const SECTION_RE = /^(quick recap|recap|next steps|action items|summary|meeting summary|detailed summary)$/i;
const BULLET_RE = /^\s*(?:[•●◦▪‣∙·\-*–]|\d{1,2}[.)])\s+/;
const NOISE_RE = [
  /^ai-generated content may be inaccurate/i,
  /always check for accuracy/i,
  /^page \d+( of \d+)?$/i,
  /^\d+\s*\/\s*\d+$/,
  /^(share|edit|copy|thumbs up|thumbs down|was this summary helpful\??)$/i,
  /^meeting summary for .*$/i,
];

function clean(raw: string) {
  return raw
    .replace(/[​-‍﻿­]/g, "") // zero-width characters Zoom inserts after headings
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, "").replace(/^\s{2,}/, " ").trimStart())
    .filter((l) => !NOISE_RE.some((re) => re.test(l.trim())));
}

const endsSentence = (l: string) => /[.!?:;"”')\]]$/.test(l.trim());

function looksLikeHeading(line: string) {
  const t = line.trim();
  const words = t.split(/\s+/).length;
  return t.length > 0 && t.length <= 80 && words <= 10 && /^[A-Z0-9"“]/.test(t) && !/[.,;:!?]$/.test(t);
}

/** Joins wrapped lines into paragraphs. A blank line or a heading-shaped line after a finished sentence starts a new block. */
type Line = { kind: "heading" | "bullet" | "text"; text: string };
function classify(lines: string[]): Line[] {
  const out: Line[] = [];
  let prevFinished = true; // start of text, blank line, or previous line ended a sentence
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // A heading-shaped line whose next line continues in lowercase is really a wrapped sentence.
    const next = lines.slice(i + 1).find((l) => l.trim())?.trim() ?? "";
    const continues = /^[a-z]/.test(next) && !BULLET_RE.test(next);
    if (!line) {
      prevFinished = true;
      out.push({ kind: "text", text: "" });
      continue;
    }
    if (BULLET_RE.test(line)) {
      out.push({ kind: "bullet", text: line.replace(BULLET_RE, "").trim() });
      prevFinished = endsSentence(line);
      continue;
    }
    if (SECTION_RE.test(line) || (prevFinished && looksLikeHeading(line) && !continues)) {
      out.push({ kind: "heading", text: line });
      prevFinished = true;
      continue;
    }
    out.push({ kind: "text", text: line });
    prevFinished = endsSentence(line);
  }
  return out;
}

/** Collapses classified lines into blocks: headings, bullets (with wrapped continuation) and paragraphs. */
type Block = { kind: "heading" | "bullet" | "para"; text: string };
function blocks(lines: Line[]): Block[] {
  const out: Block[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (l.kind === "heading") out.push({ kind: "heading", text: l.text });
    else if (l.kind === "bullet") out.push({ kind: "bullet", text: l.text });
    else if (l.text === "") {
      if (last && last.kind !== "heading") out.push({ kind: "para", text: "" }); // paragraph break marker
    } else if (last && (last.kind === "bullet" || last.kind === "para") && last.text !== "") {
      last.text += " " + l.text; // wrapped line
    } else {
      out.push({ kind: "para", text: l.text });
    }
  }
  return out.filter((b) => b.text !== "");
}

/** "Greg: call vendor", "Greg to call vendor", "Greg will call vendor" → owner + task. */
function splitOwner(text: string): ZoomAction {
  const m = text.match(/^([A-Z][\w'’-]+(?:\s[A-Z][\w'’-]+){0,2})\s*(?::|\s-\s|\s–\s|\s(?=(?:to|will|should|needs to|must)\s))\s*(.+)$/);
  if (m) {
    const task = m[2].replace(/^(to|will|should|needs to|must)\s+/i, "");
    return { owner: m[1], text: task.charAt(0).toUpperCase() + task.slice(1) };
  }
  return { owner: null, text };
}

export function parseZoomNotes(raw: string): ParsedZoomNotes {
  const bl = blocks(classify(clean(raw)));
  const result: ParsedZoomNotes = { title: null, recap: null, topics: [], actions: [], recognized: false };
  type Mode = "preamble" | "recap" | "next" | "summary";
  let mode: Mode = "preamble";
  let owner: string | null = null;
  let topic: ZoomTopic | null = null;
  const recap: string[] = [];
  const preamble: string[] = [];

  const flushTopic = () => {
    if (topic && topic.body.trim()) result.topics.push({ title: topic.title, body: topic.body.trim() });
    topic = null;
  };

  for (const b of bl) {
    if (b.kind === "heading" && SECTION_RE.test(b.text)) {
      flushTopic();
      const h = b.text.toLowerCase();
      mode = h.includes("recap") ? "recap" : h.includes("next") || h.includes("action") ? "next" : "summary";
      result.recognized = true;
      owner = null;
      continue;
    }
    switch (mode) {
      case "preamble":
        if (b.kind === "heading" && !result.title) result.title = b.text;
        else if (result.title && !preamble.length && b.text.length < 60 && !endsSentence(b.text)) result.title += " " + b.text;
        else preamble.push(b.text);
        break;
      case "recap":
        recap.push(b.text);
        break;
      case "next":
        if (b.kind === "heading") owner = b.text.toLowerCase() === "unassigned" ? null : b.text;
        else if (b.kind === "bullet") {
          const split = owner ? { owner, text: b.text } : splitOwner(b.text);
          result.actions.push(split);
        } else if (b.text.trim()) {
          // Plain-sentence next steps (no bullets) are still action items.
          for (const s of b.text.split(/(?<=\.)\s+(?=[A-Z])/)) result.actions.push(owner ? { owner, text: s } : splitOwner(s));
        }
        break;
      case "summary":
        if (b.kind === "heading") {
          flushTopic();
          topic = { title: b.text, body: "" };
        } else {
          topic ??= { title: null, body: "" };
          topic.body += (topic.body ? "\n\n" : "") + (b.kind === "bullet" ? `• ${b.text}` : b.text);
        }
        break;
    }
  }
  flushTopic();
  if (result.recognized && !result.title && preamble[0] && preamble[0].length < 120) result.title = preamble[0];
  result.recap = recap.join("\n\n").trim() || null;

  if (!result.recognized) {
    // Not Zoom-formatted: keep everything as one block for the user to place.
    const body = [result.title, ...preamble].filter(Boolean).join("\n\n").trim();
    result.title = null;
    if (body) result.topics = [{ title: null, body }];
  }
  result.actions = result.actions.map((a) => ({ ...a, text: a.text.replace(/\s+/g, " ").trim() })).filter((a) => a.text.length > 2);
  return result;
}

/** Converts a WebVTT transcript (Zoom "Audio Transcript") into "Speaker: text" lines. */
export function vttToText(vtt: string) {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    const t = l.trim();
    if (!t || t === "WEBVTT" || /^\d+$/.test(t) || /-->/.test(t) || /^NOTE\b/.test(t)) continue;
    const prev = out[out.length - 1];
    const speaker = t.match(/^([^:]{1,40}):\s/)?.[1];
    if (prev && speaker && prev.startsWith(speaker + ":")) out[out.length - 1] = prev + " " + t.slice(speaker.length + 1).trim();
    else out.push(t);
  }
  return out.join("\n\n");
}

export type MinutesSectionKey =
  | "callToOrder" | "previousMinutes" | "oldBusiness" | "newBusiness"
  | "committeeReports" | "projectUpdates" | "otherBusiness" | "recommendations";

/** Best-guess minutes section for a Zoom summary topic. Users can change every choice before importing. */
export function suggestSection(title: string | null): MinutesSectionKey | "skip" {
  const t = (title ?? "").toLowerCase();
  if (/family|personal|small talk|greeting|introduction|chit[- ]?chat|casual|weather|holiday plans|logistics/.test(t)) return "skip";
  if (/previous minutes|prior minutes|last meeting'?s minutes/.test(t)) return "previousMinutes";
  if (/call to order|opening/.test(t)) return "callToOrder";
  if (/recommend/.test(t)) return "recommendations";
  if (/progress|update|project|status/.test(t)) return "projectUpdates";
  if (/report|incident|data|statistic|financ|budget/.test(t)) return "committeeReports";
  if (/old business|follow[- ]?up|ongoing|pending|carry/.test(t)) return "oldBusiness";
  if (/other|miscellaneous|open forum|resident comments/.test(t)) return "otherBusiness";
  return "newBusiness";
}

/** Matches a Zoom speaker/owner name ("Greg", "Greg Beck") to one roster member, if unambiguous. */
/** When a first name is shared, `preferId` (the person doing the import, usually the Zoom host) wins the tie. */
export function matchPerson<T extends { id: string; name: string }>(name: string | null, roster: T[], preferId?: string | null): T | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const full = roster.filter((r) => r.name.toLowerCase() === n);
  if (full.length === 1) return full[0];
  const first = roster.filter((r) => r.name.split(" ")[0].toLowerCase() === n.split(" ")[0]);
  if (first.length === 1) return first[0];
  return first.find((r) => r.id === preferId) ?? null;
}

/** Roster members whose full name, or unambiguous first name, appears in the notes. */
export function mentionedMembers<T extends { id: string; name: string }>(text: string, roster: T[], preferId?: string | null) {
  return roster.filter((r) => {
    const [first] = r.name.split(" ");
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc(r.name)}\\b`).test(text)) return true;
    const sameFirst = roster.filter((o) => o.name.split(" ")[0] === first).length;
    return (sameFirst === 1 || r.id === preferId) && first.length > 2 && new RegExp(`\\b${esc(first)}\\b`).test(text);
  });
}
