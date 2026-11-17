// Pinned to MapLibre 5: deck.gl 9.4 reads map.transform, which MapLibre 6 removed.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FileSource, PMTiles, Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, IconLayer } from "@deck.gl/layers";
import type { CheckResult } from "./types";

const TILES = "/tiles/sacramento.pmtiles";
const CENTER: [number, number] = [-121.4944, 38.5766];

// Generic smiley marker drawn for the spike (placeholder art, not final design).
const SMILEY = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
     <circle cx="32" cy="32" r="28" fill="none" stroke="#b3121b" stroke-width="5"/>
     <circle cx="23" cy="25" r="4" fill="#b3121b"/><circle cx="41" cy="25" r="4" fill="#b3121b"/>
     <path d="M18 38 Q32 52 46 38" fill="none" stroke="#b3121b" stroke-width="5" stroke-linecap="round"/>
   </svg>`,
);

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const points = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  position: [CENTER[0] + (rand() - 0.5) * 0.12, CENTER[1] + (rand() - 0.5) * 0.09] as [number, number],
  weight: 1 + Math.floor(rand() * 10),
}));

// Tauri's asset protocol may not honour HTTP Range; fall back to an in-memory archive.
async function registerTiles(protocol: Protocol): Promise<{ url: string; mode: string }> {
  const probe = await fetch(TILES, { headers: { Range: "bytes=0-15" } });
  if (probe.status === 206) return { url: `pmtiles://${location.origin}${TILES}`, mode: "http-range" };
  const blob = await (await fetch(TILES)).blob();
  const archive = new PMTiles(new FileSource(new File([blob], "sacramento.pmtiles")));
  protocol.add(archive);
  return { url: `pmtiles://sacramento.pmtiles`, mode: `in-memory (${(blob.size / 1e6).toFixed(1)} MB, range status ${probe.status})` };
}

// opts (comma-separated): "lite" = no AA/screenshot buffer at 1x, "nodeck" = no deck.gl overlay,
// "workers=N" = MapLibre worker count, "flat" = no pitch and no extrusions, "cache=N" = max tile cache size.
export async function checkMap(container: HTMLElement, opts = ""): Promise<CheckResult & { map: maplibregl.Map }> {
  const lite = opts.includes("lite");
  const workers = /workers=(\d+)/.exec(opts)?.[1];
  const cache = /cache=(\d+)/.exec(opts)?.[1];
  if (workers) maplibregl.setWorkerCount(Number(workers));
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  const { url, mode } = await registerTiles(protocol);

  const map = new maplibregl.Map({
    container,
    center: CENTER,
    zoom: 14.2,
    pitch: opts.includes("flat") ? 0 : 62,
    ...(cache ? { maxTileCacheSize: Number(cache) } : {}),
    bearing: -24,
    canvasContextAttributes: { preserveDrawingBuffer: !lite, antialias: !lite },
    pixelRatio: lite ? 1 : window.devicePixelRatio,
    style: {
      version: 8,
      glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
      sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/dark",
      sources: { protomaps: { type: "vector", url, attribution: "© OpenStreetMap, Protomaps" } },
      layers: [
        ...layers("protomaps", namedFlavor("dark"), { lang: "en" }),
        ...(opts.includes("flat") ? [] : [{
          id: "buildings-3d",
          type: "fill-extrusion",
          source: "protomaps",
          "source-layer": "buildings",
          paint: {
            "fill-extrusion-color": "#2b2f36",
            "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
            "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.85,
          },
        } satisfies maplibregl.LayerSpecification]),
      ],
    },
  });

  const errors = new Map<string, number>();
  const note = (msg: string) => errors.set(msg.slice(0, 160), (errors.get(msg.slice(0, 160)) ?? 0) + 1);
  window.addEventListener("error", (ev) => note(`window: ${ev.message}`));
  const consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    note(`console: ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ")}`);
    consoleError(...args);
  };
  const overlay = new MapboxOverlay({
    interleaved: true,
    onError: (e, layer) => note(`deck${layer ? `[${layer.id}]` : ""}: ${e.message}`),
    layers: [
      new ColumnLayer({
        id: "columns",
        data: points,
        getPosition: (d) => d.position,
        getElevation: (d) => d.weight * 40,
        radius: 35,
        getFillColor: [179, 18, 27, 160],
        extruded: true,
      }),
      new IconLayer({
        id: "smileys",
        data: points,
        getPosition: (d) => d.position,
        getIcon: () => ({ id: "smiley", url: SMILEY, width: 64, height: 64 }),
        getSize: 38,
        billboard: true,
        onIconError: (e) => console.error("icon error", e),
        updateTriggers: {},
      }),
    ],
  });
  if (!opts.includes("nodeck")) map.addControl(overlay);

  map.on("error", (e: { error?: { message?: string } }) => note(String(e.error?.message ?? e.error)));
  const t0 = performance.now();
  const idle = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 30_000);
    map.once("idle", () => { clearTimeout(timer); resolve(true); });
  });
  const errorText = [...errors].map(([m, n]) => `${n}x ${m}`).join(" | ") || "none";
  if (!idle) {
    return {
      pass: false,
      map,
      detail: `tiles ${mode}; no idle in 30 s; styleLoaded=${map.isStyleLoaded()}, ` +
        `tilesLoaded=${map.areTilesLoaded()}, errors: ${errorText}`,
    };
  }
  // Give deck.gl one more frame to draw icons after their atlas loads.
  await new Promise((r) => setTimeout(r, 1500));
  const idleMs = performance.now() - t0;

  const flat = opts.includes("flat");
  const buildings = flat ? 0 : map.queryRenderedFeatures({ layers: ["buildings-3d"] }).length;
  const roads = map.querySourceFeatures("protomaps", { sourceLayer: "roads" }).length;
  const pass = (flat || buildings > 0) && roads > 0;
  return {
    pass,
    map,
    detail: `tiles ${mode}, first idle ${idleMs.toFixed(0)} ms, rendered 3D buildings=${buildings}, ` +
      `road features=${roads}, deck columns+icons=${points.length}, opts="${opts}", workers=${maplibregl.getWorkerCount()}, pixelRatio=${map.getPixelRatio()}, errors: ${errorText}`,
  };
}
