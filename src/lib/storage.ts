import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UserError } from "./action";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Allowed upload types: extension -> canonical MIME type. SVG/HTML are intentionally excluded (XSS). */
const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
};
export const ACCEPT_ATTR = Object.keys(ALLOWED).map((e) => `.${e}`).join(",");
const INLINE_SAFE = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "text/plain"]);

export function validateUpload(file: File) {
  if (!file || typeof file === "string" || file.size === 0) throw new UserError("Please choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UserError("File is too large (maximum 25 MB).");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = ALLOWED[ext];
  if (!mime) throw new UserError("That file type is not allowed. Upload PDF, Word, Excel, PowerPoint, text, CSV, or image files.");
  return { ext, mime };
}

/** Light magic-byte check so a renamed executable can't masquerade as a PDF/image. */
function sniffOk(buf: Buffer, mime: string) {
  const startsWith = (sig: number[]) => sig.every((b, i) => buf[i] === b);
  switch (mime) {
    case "application/pdf": return startsWith([0x25, 0x50, 0x44, 0x46]);
    case "image/png": return startsWith([0x89, 0x50, 0x4e, 0x47]);
    case "image/jpeg": return startsWith([0xff, 0xd8, 0xff]);
    case "image/gif": return startsWith([0x47, 0x49, 0x46]);
    default: return true;
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(-120) || "file";
}

type Driver = "s3" | "local";
function driver(): Driver {
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) return "s3";
  // Local disk is for development only. It is never used on Render (RENDER is set there),
  // because Render's filesystem is wiped on every deploy.
  if (!process.env.RENDER && (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_STORAGE === "true")) {
    if (process.env.ALLOW_LOCAL_STORAGE !== "false") return "local";
  }
  throw new UserError("File storage is not configured. Set the S3_* environment variables.");
}

let s3: S3Client | null = null;
function client() {
  s3 ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  });
  return s3;
}

const LOCAL_ROOT = path.join(process.cwd(), "uploads");

export async function storeUpload(file: File, opts: { organizationId: string; committeeId: string }) {
  const { mime } = validateUpload(file);
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffOk(buf, mime)) throw new UserError("The file contents don't match its file type.");
  const key = `org/${opts.organizationId}/committee/${opts.committeeId}/${randomUUID()}-${sanitizeFilename(file.name)}`;
  if (driver() === "s3") {
    await client().send(
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: buf, ContentType: mime }),
    );
  } else {
    const full = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
  }
  return { storageKey: key, mimeType: mime, fileSize: buf.length, originalFilename: file.name.slice(0, 255) };
}

export type DownloadTarget =
  | { type: "redirect"; url: string }
  | { type: "buffer"; body: Buffer; contentType: string; disposition: string };

export async function getDownload(doc: { storageKey: string; mimeType: string; originalFilename: string }, inline: boolean): Promise<DownloadTarget> {
  const asInline = inline && INLINE_SAFE.has(doc.mimeType);
  const safeName = doc.originalFilename.replace(/["\r\n]/g, "");
  const disposition = `${asInline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`;
  if (driver() === "s3") {
    const url = await getSignedUrl(
      client(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: doc.storageKey,
        ResponseContentDisposition: disposition,
        ResponseContentType: doc.mimeType,
      }),
      { expiresIn: 300 },
    );
    return { type: "redirect", url };
  }
  const full = path.join(LOCAL_ROOT, doc.storageKey);
  if (!full.startsWith(LOCAL_ROOT)) throw new Error("Invalid key");
  return { type: "buffer", body: await readFile(full), contentType: doc.mimeType, disposition };
}

export async function storageHealth(): Promise<string> {
  try {
    const d = driver();
    if (d === "local") return "local-dev";
    await client().send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET! }));
    return "ok";
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}
