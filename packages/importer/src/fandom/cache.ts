import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FandomPage } from "./client.ts";

export const DEFAULT_CACHE_DIR = "data/.cache/fandom";

export interface FandomCacheOptions {
  dir?: string;
  /** Serve only from cache; never touch the network (clients throw on a miss). */
  offline?: boolean;
  /** Read the request cache before fetching (default: always fetch, then write). */
  preferCache?: boolean;
}

/** On-disk cache: raw API responses keyed by request hash, plus pages stored by title with revid. */
export class FandomCache {
  readonly dir: string;
  readonly offline: boolean;
  readonly preferCache: boolean;

  constructor(opts: FandomCacheOptions = {}) {
    this.dir = opts.dir ?? DEFAULT_CACHE_DIR;
    this.offline = opts.offline ?? false;
    this.preferCache = opts.preferCache ?? false;
  }

  static requestKey(params: Record<string, string>): string {
    const canon = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    return createHash("sha1").update(canon).digest("hex");
  }

  private async read<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  private async write(sub: string, name: string, value: unknown): Promise<void> {
    const dir = join(this.dir, sub);
    await mkdir(dir, { recursive: true });
    const file = join(dir, name);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value), "utf8");
    await rename(tmp, file);
  }

  getResponse(params: Record<string, string>): Promise<unknown | null> {
    return this.read(join(this.dir, "requests", `${FandomCache.requestKey(params)}.json`));
  }
  putResponse(params: Record<string, string>, body: unknown): Promise<void> {
    return this.write("requests", `${FandomCache.requestKey(params)}.json`, body);
  }

  private static pageFile(title: string): string {
    const slug = title.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
    return `${slug}-${createHash("sha1").update(title).digest("hex").slice(0, 10)}.json`;
  }
  getPage(title: string): Promise<FandomPage | null> {
    return this.read(join(this.dir, "pages", FandomCache.pageFile(title)));
  }
  putPage(page: FandomPage): Promise<void> {
    return this.write("pages", FandomCache.pageFile(page.title), page);
  }
}
