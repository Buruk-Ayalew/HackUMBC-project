import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { HttpError, politeFetch } from "../../http.js";

// Fetch an official page (HTML or PDF) and return its readable text with
// whitespace, entities, and curly quotes normalized, so facts can be matched.

export class PageUnavailable extends Error {
  constructor(
    public url: string,
    public reason: string,
  ) {
    super(`${new URL(url).host}: ${reason}`);
  }
}

export function normalizeText(t: string): string {
  return t
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ |​/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPageText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await politeFetch(url, {}, 30000);
  } catch (err) {
    // 403 and friends: the site is blocking or down. Report it; never work around it.
    const reason = err instanceof HttpError ? `HTTP ${err.status}` : (err as Error).message;
    throw new PageUnavailable(url, reason);
  }
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf") || /\.pdf($|\?)/i.test(url)) {
    const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
    try {
      const { text } = await parser.getText();
      return normalizeText(text);
    } finally {
      await parser.destroy();
    }
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const text = normalizeText(cheerio.load($.html()).text());
  if (text.length < 200) throw new PageUnavailable(url, "page returned no readable content");
  return text;
}

// Raw PDF text keeps line breaks (needed to read table rows).
export async function fetchPdfLines(url: string): Promise<string[]> {
  let res: Response;
  try {
    res = await politeFetch(url, {}, 30000);
  } catch (err) {
    const reason = err instanceof HttpError ? `HTTP ${err.status}` : (err as Error).message;
    throw new PageUnavailable(url, reason);
  }
  if (!(res.headers.get("content-type") ?? "").includes("pdf")) throw new PageUnavailable(url, "not a PDF");
  const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) });
  try {
    const { text } = await parser.getText();
    return text.split("\n").map((l) => l.replace(/ /g, " ").trim());
  } finally {
    await parser.destroy();
  }
}
