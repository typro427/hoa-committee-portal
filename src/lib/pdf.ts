import "server-only";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

const NAVY = rgb(0.11, 0.18, 0.31);
const GRAY = rgb(0.4, 0.43, 0.48);
const LIGHT = rgb(0.88, 0.9, 0.93);
const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const M = 54;

/** Replace characters the standard PDF fonts (WinAnsi) can't encode. */
function clean(text: string) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/\t/g, "    ")
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, "?");
}

/** Consistent letter-size document template used for minutes, agendas, and reports. */
export class PdfBuilder {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private font!: PDFFont;
  private bold!: PDFFont;
  private y = 0;

  private constructor(private orgName: string, private docTitle: string, private subtitle?: string) {}

  static async create(orgName: string, title: string, subtitle?: string) {
    const b = new PdfBuilder(orgName, title, subtitle);
    b.doc = await PDFDocument.create();
    b.doc.setTitle(`${title}${subtitle ? " - " + subtitle : ""}`);
    b.doc.setProducer("HOA Committee Portal");
    b.font = await b.doc.embedFont(StandardFonts.Helvetica);
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold);
    b.newPage(true);
    return b;
  }

  private newPage(first = false) {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - M;
    if (first) {
      this.page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: NAVY });
      this.text(clean(this.orgName).toUpperCase(), { size: 10, font: this.bold, color: GRAY });
      this.y -= 4;
      this.text(clean(this.docTitle), { size: 20, font: this.bold, color: NAVY });
      if (this.subtitle) this.text(clean(this.subtitle), { size: 12, color: GRAY });
      this.y -= 6;
      this.rule(NAVY, 1.5);
      this.y -= 6;
    } else {
      this.text(clean(`${this.orgName} - ${this.docTitle}`), { size: 8, color: GRAY });
      this.y -= 8;
    }
  }

  private ensure(h: number) {
    if (this.y - h < M + 20) this.newPage();
  }

  private text(t: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) {
    const size = o.size ?? 10;
    this.ensure(size + 4);
    this.page.drawText(t, { x: o.x ?? M, y: this.y - size, size, font: o.font ?? this.font, color: o.color ?? rgb(0.1, 0.1, 0.12) });
    this.y -= size + 4;
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of clean(text).split("\n")) {
      if (para.trim() === "") { lines.push(""); continue; }
      let line = "";
      for (const word of para.split(/ +/)) {
        const tryLine = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; continue; }
        if (line) lines.push(line);
        // Hard-break very long words.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let i = w.length;
          while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
          lines.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
      lines.push(line);
    }
    return lines;
  }

  rule(color = LIGHT, thickness = 0.75) {
    this.ensure(6);
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE_W - M, y: this.y }, thickness, color });
    this.y -= 6;
  }

  space(h = 8) { this.y -= h; }

  heading(t: string) {
    this.ensure(40);
    this.y -= 8;
    this.text(clean(t), { size: 13, font: this.bold, color: NAVY });
    this.rule();
  }

  paragraph(t: string | null | undefined, opts: { size?: number; indent?: number; color?: ReturnType<typeof rgb>; bold?: boolean } = {}) {
    const body = (t ?? "").trim() || "None recorded.";
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const font = opts.bold ? this.bold : this.font;
    for (const line of this.wrap(body, font, size, PAGE_W - 2 * M - indent)) {
      this.ensure(size + 4);
      if (line) this.page.drawText(line, { x: M + indent, y: this.y - size, size, font, color: opts.color ?? rgb(0.1, 0.1, 0.12) });
      this.y -= size + 4;
    }
    this.y -= 2;
  }

  keyValues(rows: [string, string | null | undefined][]) {
    const labelW = 130;
    for (const [k, v] of rows) {
      const lines = this.wrap(v?.trim() || "—", this.font, 10, PAGE_W - 2 * M - labelW);
      this.ensure(14 * lines.length);
      this.page.drawText(clean(k), { x: M, y: this.y - 10, size: 10, font: this.bold, color: GRAY });
      for (const line of lines) {
        this.page.drawText(line, { x: M + labelW, y: this.y - 10, size: 10, font: this.font });
        this.y -= 14;
      }
    }
    this.y -= 4;
  }

  bullets(items: string[]) {
    if (items.length === 0) return this.paragraph("None.");
    for (const item of items) {
      const lines = this.wrap(item, this.font, 10, PAGE_W - 2 * M - 14);
      lines.forEach((line, i) => {
        this.ensure(14);
        if (i === 0) this.page.drawText("-", { x: M + 2, y: this.y - 10, size: 10, font: this.bold, color: NAVY });
        this.page.drawText(line, { x: M + 14, y: this.y - 10, size: 10, font: this.font });
        this.y -= 14;
      });
    }
    this.y -= 4;
  }

  /** Simple table; widths are fractions of the content width. */
  table(columns: { label: string; width: number }[], rows: string[][]) {
    const total = PAGE_W - 2 * M;
    const widths = columns.map((c) => c.width * total);
    const drawHeader = () => {
      this.ensure(22);
      this.page.drawRectangle({ x: M, y: this.y - 16, width: total, height: 16, color: rgb(0.94, 0.95, 0.97) });
      let x = M + 4;
      columns.forEach((c, i) => {
        this.page.drawText(clean(c.label), { x, y: this.y - 12, size: 8.5, font: this.bold, color: NAVY });
        x += widths[i];
      });
      this.y -= 20;
    };
    drawHeader();
    if (rows.length === 0) {
      this.paragraph("No records.", { size: 9, color: GRAY });
      return;
    }
    for (const row of rows) {
      const cells = row.map((cell, i) => this.wrap(cell || "—", this.font, 9, widths[i] - 8));
      const h = Math.max(...cells.map((c) => c.length)) * 12 + 4;
      if (this.y - h < M + 20) { this.newPage(); drawHeader(); }
      let x = M + 4;
      cells.forEach((lines, i) => {
        lines.forEach((line, li) => this.page.drawText(line, { x, y: this.y - 9 - li * 12, size: 9, font: this.font }));
        x += widths[i];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y + 1 }, end: { x: PAGE_W - M, y: this.y + 1 }, thickness: 0.5, color: LIGHT });
      this.y -= 3;
    }
    this.y -= 6;
  }

  async toBuffer() {
    const pages = this.doc.getPages();
    const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    pages.forEach((p, i) => {
      p.drawText(clean(`Generated ${generated}`), { x: M, y: 28, size: 8, font: this.font, color: GRAY });
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, { x: PAGE_W - M - this.font.widthOfTextAtSize(label, 8), y: 28, size: 8, font: this.font, color: GRAY });
    });
    return Buffer.from(await this.doc.save());
  }
}

export function pdfResponse(buf: Buffer, filename: string, inline = false) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function csvResponse(rows: (string | number | null | undefined)[][], filename: string) {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // prevent CSV formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
