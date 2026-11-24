// Full-bleed 3D night map. MapLibre pinned to 5.x (deck.gl 9.4 breaks on 6); tiles are read by HTTP Range (never loaded whole).
// Offline: the style has no glyphs/sprite and no symbol layers, so nothing is requested from the network.
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FetchSource, PMTiles, Protocol } from "pmtiles";
import { BLACK, layers as baseLayers } from "@protomaps/basemaps";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { IconLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { LayerSpecification } from "maplibre-gl";
import { Glow, Landmark, Ring, Smiley, toDataUri } from "./art";
import { isPmtilesHeader } from "./pmtilesBytes";
import type { PinModel } from "./viewModel";

type Bounds = [number, number, number, number]; // west, south, east, north
// One PMTiles extract per region, each its own vector source and each with its own availability.
const SOURCES: { id: string; file: string; bounds: Bounds }[] = [
  { id: "california", file: "california.pmtiles", bounds: [-124.5, 32.5, -114.1, 42.1] },
  { id: "austin", file: "austin.pmtiles", bounds: [-98.1, 30.05, -97.45, 30.55] },
];
// Fallback camera (downtown Sacramento) when no visible location carries a current team_base claim.
const SACRAMENTO: [number, number] = [-121.5, 38.5775];
const UNION: Bounds = [
  Math.min(...SOURCES.map((s) => s.bounds[0])), Math.min(...SOURCES.map((s) => s.bounds[1])),
  Math.max(...SOURCES.map((s) => s.bounds[2])), Math.max(...SOURCES.map((s) => s.bounds[3])),
];
// Pan limit: the union of both extracts plus a margin. MapLibre never zooms out past the point where the
// viewport fills `maxBounds`, so with the bare union both regions could not be framed together at 1440x900.
// The margin shows the dark background around them instead.
const PAN_BOUNDS: Bounds = [UNION[0] - 12, UNION[1] - 6, UNION[2] + 12, UNION[3] + 6];
// Zoom ~5 frames California and Austin together in a 1440x900 window; the tile data stops at z13 and overzooms above it.
const MIN_ZOOM = 4.5;
const MAX_ZOOM = 17;
// Camera center sits in the free area between the case rail, legend panel and characters strip.
const PADDING = { left: 380, right: 330, top: 120, bottom: 130 }; // downtown, Sacramento River to the west
const TEXT = "#ece4d8";
const GOLD = "#d9b25a";

// Red is reserved for Red John: the basemap is the neutral "black" flavor with a blue-black river.
// Symbol layers (labels, POIs, shields) are dropped: they need glyph PBFs and sprites, which are not
// bundled, and the pins and their labels (deck.gl, canvas text) are what the map is for.
const noSymbols = (ls: ReturnType<typeof baseLayers>) => ls.filter((l) => l.type !== "symbol");

const flavor = { ...BLACK, water: "#0e1a23", earth: "#121110", buildings: "#1a1715", ocean_label: "#8fa6b2" };

// Icons go to deck.gl as one pre-decoded canvas atlas (iconAtlas + iconMapping), never as URLs: deck would
// fetch() a data: URL, which would need data: in connect-src. <img src="data:..."> only needs img-src data:.
const ICON_SPECS = [
  { id: "smiley", el: <Smiley width="64" height="74" />, w: 64, h: 74, anchorY: 74 },
  { id: "landmark", el: <Landmark width="48" height="48" />, w: 48, h: 48, anchorY: 48 },
  { id: "glowRed", el: <Glow color="#e0283a" />, w: 64, h: 64, anchorY: 32 },
  { id: "glowGold", el: <Glow color={GOLD} />, w: 64, h: 64, anchorY: 32 },
  { id: "ringSolid", el: <Ring color={TEXT} />, w: 64, h: 64, anchorY: 32 },
  { id: "ringGold", el: <Ring color={GOLD} />, w: 64, h: 64, anchorY: 32 },
  { id: "ringDash", el: <Ring color={TEXT} dash />, w: 64, h: 64, anchorY: 32 },
  { id: "pulse", el: <Ring color="#e0283a" />, w: 64, h: 64, anchorY: 32 },
] as const;
type IconId = (typeof ICON_SPECS)[number]["id"];
const ICONS = Object.fromEntries(ICON_SPECS.map((s) => [s.id, s.id])) as { [K in IconId]: K };

interface Atlas { image: HTMLCanvasElement; mapping: Record<string, { x: number; y: number; width: number; height: number; anchorX: number; anchorY: number }> }

const loadImage = (src: string, w: number, h: number) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(w, h);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("icon failed to load"));
    img.src = src;
  });

let atlasPromise: Promise<Atlas> | null = null;
function loadAtlas(): Promise<Atlas> {
  atlasPromise ??= (async () => {
    const imgs = await Promise.all(ICON_SPECS.map((s) => loadImage(toDataUri(s.el), s.w, s.h)));
    const image = document.createElement("canvas");
    image.width = ICON_SPECS.reduce((n, s) => n + s.w, 0);
    image.height = Math.max(...ICON_SPECS.map((s) => s.h));
    const ctx = image.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const mapping: Atlas["mapping"] = {};
    let x = 0;
    ICON_SPECS.forEach((s, i) => {
      ctx.drawImage(imgs[i] as HTMLImageElement, x, 0, s.w, s.h);
      mapping[s.id] = { x, y: 0, width: s.w, height: s.h, anchorX: s.w / 2, anchorY: s.anchorY };
      x += s.w;
    });
    return { image, mapping };
  })().catch((e) => {
    atlasPromise = null;
    throw e;
  });
  return atlasPromise;
}

/** Tauri serves the bundled file through the ranged `tiles://` protocol (src-tauri/src/tiles.rs); a browser uses the Vite static server, which also honors Range. */
function tilesUrl(file: string): string {
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  return inTauri ? convertFileSrc(file, "tiles") : new URL(`/tiles/${file}`, window.location.href).href;
}

let protocol: Protocol | null = null;
const tiles = new Map<string, Promise<string>>();
/** Checks one extract (magic bytes of a ranged read) and registers it; rejects when it is missing or not a PMTiles file. */
function registerTiles(file: string): Promise<string> {
  let p = tiles.get(file);
  if (!p) {
    p = (async () => {
      if (!protocol) {
        protocol = new Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);
      }
      const url = tilesUrl(file);
      // First ranged read (the 16-byte start of the header). Dev servers and SPA resolvers answer a missing file
      // with index.html and 200: check the magic bytes.
      const res = await fetch(url, { headers: { Range: "bytes=0-15" } });
      if (!res.ok) throw new Error("basemap unavailable");
      if (!isPmtilesHeader(new Uint8Array(await res.arrayBuffer()).subarray(0, 8))) throw new Error("basemap unavailable");
      protocol.add(new PMTiles(new FetchSource(url)));
      return `pmtiles://${url}`;
    })().catch((e) => {
      tiles.delete(file); // allow a retry on the next mount
      throw e;
    });
    tiles.set(file, p);
  }
  return p;
}

/** The same night style per source: protomaps layers with ids prefixed by the source, one shared background, plus 3D buildings. */
function sourceLayers(id: string): LayerSpecification[] {
  return [
    ...noSymbols(baseLayers(id, flavor, { lang: "en" }))
      .filter((l) => l.type !== "background" || id === SOURCES[0]?.id)
      .map((l) => ({ ...l, id: `${id}:${l.id}` }) as LayerSpecification),
    {
      id: `${id}:buildings-3d`,
      type: "fill-extrusion",
      source: id,
      "source-layer": "buildings",
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "height"], 8], 0, "#2c2825", 40, "#3b3531", 120, "#4d453e"],
        "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.92,
      },
    },
  ];
}

interface Props {
  pins: PinModel[];
  selectedPin: string | null;
  linkedCase: string | null;
  reducedMotion: boolean;
  /** [lon, lat] of the team's current base at the viewer's progress; null falls back to Sacramento. */
  base: [number, number] | null;
  onUnavailable: () => void;
  onSelectPin: (id: string) => void;
}

export function RedMap({ pins, selectedPin, linkedCase, reducedMotion, base, onUnavailable, onSelectPin }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const onSelect = useRef(onSelectPin);
  onSelect.current = onSelectPin;
  const onFail = useRef(onUnavailable);
  onFail.current = onUnavailable;
  const mapRef = useRef<maplibregl.Map | null>(null);
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;
  const center = base ?? SACRAMENTO;
  const centerRef = useRef(center);
  centerRef.current = center;

  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    Promise.allSettled(SOURCES.map((src) => registerTiles(src.file))).then((results) => {
      if (cancelled || !box.current) return;
      // One missing extract must not break the other: only the sources that answered join the style.
      const ok = SOURCES.flatMap((src, i) => {
        const r = results[i];
        return r?.status === "fulfilled" ? [{ id: src.id, url: r.value }] : [];
      });
      if (ok.length === 0) {
        onFail.current();
        return;
      }
      map = new maplibregl.Map({
        container: box.current,
        center: centerRef.current,
        zoom: 14.3,
        pitch: 58,
        bearing: -18,
        maxPitch: 70,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: PAN_BOUNDS,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: Object.fromEntries(ok.map((o) => [o.id, { type: "vector" as const, url: o.url, attribution: "© OpenStreetMap, Protomaps" }])),
          layers: ok.flatMap((o) => sourceLayers(o.id)),
        },
      });
      mapRef.current = map;
      map.setPadding(PADDING);
      map.jumpTo({ center: centerRef.current });
      const o = new MapboxOverlay({
        interleaved: true,
        getCursor: ({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
      });
      overlay.current = o;
      map.addControl(o);
      map.on("load", () => !cancelled && setReady(true));
      // A broken or unreadable extract surfaces only as source errors: the notice shows when every source failed.
      const failed = new Set<string>();
      map.on("error", (e) => {
        const id = (e as { sourceId?: string }).sourceId;
        if (cancelled || !id || !ok.some((o) => o.id === id)) return;
        failed.add(id);
        if (failed.size === ok.length) onFail.current();
      });
    });
    return () => {
      cancelled = true;
      overlay.current = null;
      mapRef.current = null;
      setReady(false);
      map?.remove();
    };
  }, []);

  const build = useMemo(() => {
    const common = { pickable: false, parameters: { depthCompare: "always" } } as const;
    // deck.gl turns any image source into a texture at runtime (async "image" prop); its typings only list string | Texture.
    const iconProps = { iconAtlas: atlas?.image as unknown as string | undefined, iconMapping: atlas?.mapping };
    const smileys = pins.filter((p) => p.kind === "smiley");
    return (phase: number): Layer[] => {
      const rings = (id: string, url: IconId, data: PinModel[]) =>
        new IconLayer<PinModel>({ ...common, ...iconProps, id, data, getPosition: (d) => d.position, getIcon: () => url, getSize: 74, sizeUnits: "pixels", getPixelOffset: [0, -32] });
      return [
        new IconLayer<PinModel>({
          ...common, ...iconProps, id: "glow", data: pins, getPosition: (d) => d.position, getPixelOffset: [0, -30],
          getIcon: (d) => (d.kind === "smiley" ? ICONS.glowRed : ICONS.glowGold), getSize: 120,
        }),
        new IconLayer<PinModel>({
          ...common, ...iconProps, id: "pulse", data: smileys, getPosition: (d) => d.position, getIcon: () => ICONS.pulse,
          getSize: 74, sizeScale: 0.5 + 1.3 * phase, opacity: 0.8 * (1 - phase),
        }),
        rings("ring-hover", ICONS.ringDash, pins.filter((p) => p.id === hover && p.id !== selectedPin)),
        rings("ring-linked", ICONS.ringGold, pins.filter((p) => linkedCase !== null && p.caseId === linkedCase)),
        rings("ring-selected", ICONS.ringSolid, pins.filter((p) => p.id === selectedPin)),
        new IconLayer<PinModel>({
          ...iconProps, id: "pins", data: pins, pickable: true, parameters: common.parameters,
          getPosition: (d) => d.position, getIcon: (d) => (d.kind === "smiley" ? ICONS.smiley : ICONS.landmark),
          getSize: (d) => (d.kind === "smiley" ? 56 : 38), updateTriggers: { getSize: [pins] },
          onClick: ({ object }) => object && onSelect.current(object.id),
          onHover: ({ object }) => setHover(object?.id ?? null),
        }),
        new TextLayer<PinModel>({
          ...common, id: "labels", data: pins, getPosition: (d) => d.position, getText: (d) => d.label,
          getSize: 14, getColor: [246, 240, 230, 255], background: true, backgroundPadding: [7, 4], getBackgroundColor: [10, 8, 8, 225], getTextAnchor: "start", getAlignmentBaseline: "center",
          getPixelOffset: (d) => (d.kind === "smiley" ? [36, -30] : [30, -20]),
          fontFamily: '"Segoe UI", sans-serif', fontSettings: { sdf: true }, outlineWidth: 2, outlineColor: [5, 4, 4, 255],
        }),
      ];
    };
  }, [pins, selectedPin, linkedCase, hover, atlas]);

  useEffect(() => {
    const o = overlay.current;
    if (!ready || !o || !atlas) return;
    if (reducedMotion) {
      o.setProps({ layers: build(0.35) });
      return;
    }
    let raf = 0;
    const start = performance.now();
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 40) {
        last = now;
        o.setProps({ layers: build(((now - start) % 2800) / 2800) });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, atlas, build, reducedMotion]);

  // Progress or peek moved the base (Sacramento -> Austin): re-centre there. Nothing happens on the first run (no map yet).
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (reduced.current) m.jumpTo({ center });
    else m.flyTo({ center, duration: 1600, essential: false });
  }, [center[0], center[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    loadAtlas().then((a) => !cancelled && setAtlas(a), () => !cancelled && onFail.current());
    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={box} className="rr-map" role="group" aria-label="3D map of California and Austin, opening on the team's current base. Pins are listed in the legend panel." />;
}
