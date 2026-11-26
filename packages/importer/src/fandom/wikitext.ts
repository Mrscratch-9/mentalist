export interface Template {
  /** Normalized name: trimmed, underscores to spaces, lowercase. */
  name: string;
  /** Params with lowercased, trimmed keys and trimmed raw values; positional params are "1", "2"... */
  params: Record<string, string>;
}
export interface WikiLink {
  target: string;
  label: string;
}
export interface Section {
  heading: string;
  level: number;
  text: string;
}
export interface Bullet {
  depth: number;
  text: string;
}

const NOWIKI = /<nowiki>[\s\S]*?<\/nowiki>/gi;

export function normalizeTemplateName(name: string): string {
  return name.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Index of the `}}` closing the template opened at `start` (`{{`), or -1. */
function findClose(text: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    if (text.startsWith("<nowiki>", i)) {
      const end = text.indexOf("</nowiki>", i);
      if (end === -1) return -1;
      i = end + "</nowiki>".length;
    } else if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i);
      if (end === -1) return -1;
      i = end + 3;
    } else if (text.startsWith("{{", i)) {
      depth++;
      i += 2;
    } else if (text.startsWith("}}", i)) {
      depth--;
      i += 2;
      if (depth === 0) return i - 2;
    } else {
      i++;
    }
  }
  return -1;
}

/** Split on top-level `|` (outside nested templates, links, nowiki). */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let tpl = 0;
  let link = 0;
  let i = 0;
  while (i < body.length) {
    if (body.startsWith("<nowiki>", i)) {
      const end = body.indexOf("</nowiki>", i);
      const stop = end === -1 ? body.length : end + "</nowiki>".length;
      cur += body.slice(i, stop);
      i = stop;
    } else if (body.startsWith("{{", i)) {
      tpl++;
      cur += "{{";
      i += 2;
    } else if (body.startsWith("}}", i)) {
      tpl = Math.max(0, tpl - 1);
      cur += "}}";
      i += 2;
    } else if (body.startsWith("[[", i)) {
      link++;
      cur += "[[";
      i += 2;
    } else if (body.startsWith("]]", i)) {
      link = Math.max(0, link - 1);
      cur += "]]";
      i += 2;
    } else if (body[i] === "|" && tpl === 0 && link === 0) {
      parts.push(cur);
      cur = "";
      i++;
    } else {
      cur += body[i];
      i++;
    }
  }
  parts.push(cur);
  return parts;
}

/** All top-level and nested templates, in order of appearance. Unclosed templates are skipped. */
export function parseTemplates(text: string): Template[] {
  const out: Template[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{{", i);
    if (open === -1) break;
    const close = findClose(text, open);
    if (close === -1) {
      i = open + 2;
      continue;
    }
    const [head = "", ...rest] = splitTopLevel(text.slice(open + 2, close));
    const params: Record<string, string> = {};
    let pos = 0;
    for (const part of rest) {
      const eq = part.indexOf("=");
      const eqIsParam = eq > 0 && !/[{[]/.test(part.slice(0, eq));
      if (eqIsParam) params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
      else params[String(++pos)] = part.trim();
    }
    out.push({ name: normalizeTemplateName(head), params });
    i = open + 2;
  }
  return out;
}

/** First template whose normalized name is in `names` (pass normalized names). */
export function findTemplate(text: string, names: string[]): Template | null {
  const wanted = names.map(normalizeTemplateName);
  return parseTemplates(text).find((t) => wanted.includes(t.name)) ?? null;
}

const SKIP_NS = /^(file|image|category|media):/i;

export function extractLinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of text.replace(NOWIKI, "").matchAll(/\[\[([^\[\]]+?)\]\]/g)) {
    const [rawTarget = "", ...labelParts] = (m[1] ?? "").split("|");
    if (SKIP_NS.test(rawTarget.trim())) continue;
    const target = rawTarget.split("#")[0]!.replace(/_/g, " ").trim();
    if (!target) continue;
    const label = labelParts.join("|").trim() || target;
    out.push({ target, label });
  }
  return out;
}

/** Wikitext to plain text: links to labels, no quotes/tags/comments; nowiki content kept literally. */
export function stripMarkup(text: string): string {
  const keep: string[] = [];
  let s = text.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<nowiki>([\s\S]*?)<\/nowiki>/gi, (_m, inner: string) => {
    keep.push(inner);
    return `\u0000${keep.length - 1}\u0000`;
  });
  s = s.replace(/<ref\b[^>]*\/>/gi, "").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<ref\b[^>]*>[\s\S]*$/i, "");
  s = s.replace(/<br\s*\/?>/gi, " ");
  // Every remaining HTML tag, including an unterminated one at the end of the text.
  s = s.replace(/<\/?[A-Za-z][^>]*>/g, "").replace(/<\/?[A-Za-z][^>]*$/, "");
  s = s.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, "");
  s = s.replace(/\[\[([^\[\]|]+)\|([^\[\]]*)\]\]/g, (_m, t: string, l: string) => l || t);
  s = s.replace(/\[\[([^\[\]]+)\]\]/g, "$1");
  s = s.replace(/'{2,5}/g, "");
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => keep[Number(n)] ?? "");
  return s.replace(/\s+/g, " ").trim();
}

/** Split by headings. The text before the first heading is returned with heading "" and level 0. */
export function splitSections(text: string): Section[] {
  const out: Section[] = [];
  let cur: Section = { heading: "", level: 0, text: "" };
  const lines: string[] = [];
  const flush = () => {
    cur.text = lines.join("\n").trim();
    lines.length = 0;
    out.push(cur);
  };
  for (const line of text.split(/\r?\n/)) {
    const m = /^(={2,6})\s*(.+?)\s*\1\s*$/.exec(line);
    if (m) {
      flush();
      cur = { heading: stripMarkup(m[2]!), level: m[1]!.length, text: "" };
    } else lines.push(line);
  }
  flush();
  return out;
}

/** Bullet items (`*`, `**`...) with their depth; continuation lines are not joined. */
export function extractBullets(text: string): Bullet[] {
  const out: Bullet[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\*+)\s*(.*)$/.exec(line);
    if (m && m[2]!.trim()) out.push({ depth: m[1]!.length, text: m[2]!.trim() });
  }
  return out;
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };

/**
 * Plain display text for any imported value: templates, refs, comments, every HTML tag, links, quotes
 * and entities removed, so no angle bracket, double brace, double square bracket, doubled apostrophe or
 * mw- sequence can remain (even from nowiki content).
 */
export function plainText(text: string): string {
  let s = text.replace(/&(?:nbsp|amp|quot|lt|gt|#39);/g, (m) => ENTITIES[m] ?? m);
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  }
  s = stripMarkup(s);
  // Entities may have produced tags; nowiki content may carry markup literally.
  s = s.replace(/<\/?[A-Za-z][^>]*>/g, "").replace(/<\/?[A-Za-z][^>]*$/, "");
  s = s.replace(/mw-[\w-]*/gi, "").replace(/\{\{|\}\}|\[\[|\]\]|'{2,}|[<>]/g, "");
  return s.replace(/\s+/g, " ").trim();
}
