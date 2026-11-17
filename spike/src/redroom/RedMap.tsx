// Full-bleed 3D night map. MapLibre pinned to 5.x (deck.gl 9.4 breaks on 6); tiles load in memory (no HTTP Range in Tauri).
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FileSource, PMTiles, Protocol } from "pmtiles";
import { BLACK, layers as baseLayers } from "@protomaps/basemaps";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { IconLayer, TextLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import { Glow, Landmark, Ring, Smiley, toDataUri } from "./art";
import type { KnownPin } from "./demoData";

const TILES = "/tiles/sacramento.pmtiles";
const CENTER: [number, number] = [-121.5, 38.5775];
// Camera center sits in the free area between the case rail, legend panel and characters strip.
const PADDING = { left: 380, right: 330, top: 120, bottom: 130 }; // downtown, Sacramento River to the west
const TEXT = "#ece4d8";
const GOLD = "#d9b25a";

// Red is reserved for Red John: the basemap is the neutral "black" flavor with a blue-black river.
// Basemap labels are dimmed and POIs hidden so the pins and their labels dominate.
const calmLabels = (ls: ReturnType<typeof baseLayers>) =>
  ls.map((l) => {
    if (l.type !== "symbol") return l;
    if (l.id === "pois") return { ...l, layout: { ...l.layout, visibility: "none" as const } };
    return { ...l, paint: { ...l.paint, "text-opacity": 0.45 } };
  });

const flavor = { ...BLACK, water: "#0e1a23", earth: "#121110", buildings: "#1a1715", ocean_label: "#8fa6b2" };

const icon = (url: string, width: number, height: number, anchorY: number) => ({ url, width, height, anchorY });
const ICONS = {
  smiley: icon(toDataUri(<Smiley width="64" height="74" />), 64, 74, 74),
  landmark: icon(toDataUri(<Landmark width="24" height="24" />), 24, 24, 24),
  glowRed: icon(toDataUri(<Glow color="#e0283a" />), 64, 64, 32),
  glowGold: icon(toDataUri(<Glow color={GOLD} />), 64, 64, 32),
  ringSolid: icon(toDataUri(<Ring color={TEXT} />), 64, 64, 32),
  ringGold: icon(toDataUri(<Ring color={GOLD} />), 64, 64, 32),
  ringDash: icon(toDataUri(<Ring color={TEXT} dash />), 64, 64, 32),
  pulse: icon(toDataUri(<Ring color="#e0283a" />), 64, 64, 32),
};

let tiles: Promise<string> | null = null;
function registerTiles(): Promise<string> {
  tiles ??= (async () => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    const blob = await (await fetch(TILES)).blob();
    protocol.add(new PMTiles(new FileSource(new File([blob], "sacramento.pmtiles"))));
    return "pmtiles://sacramento.pmtiles";
  })();
  return tiles;
}

interface Props {
  pins: KnownPin[];
  selectedPin: string;
  linkedEpisode: number | null;
  reducedMotion: boolean;
  onSelectPin: (id: string) => void;
}

export function RedMap({ pins, selectedPin, linkedEpisode, reducedMotion, onSelectPin }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const onSelect = useRef(onSelectPin);
  onSelect.current = onSelectPin;

  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    registerTiles().then((url) => {
      if (cancelled || !box.current) return;
      map = new maplibregl.Map({
        container: box.current,
        center: CENTER,
        zoom: 14.3,
        pitch: 58,
        bearing: -18,
        maxPitch: 70,
        attributionControl: { compact: true },
        style: {
          version: 8,
          glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
          sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/black",
          sources: { protomaps: { type: "vector", url, attribution: "© OpenStreetMap, Protomaps" } },
          layers: [
            ...calmLabels(baseLayers("protomaps", flavor, { lang: "en" })),
            {
              id: "buildings-3d",
              type: "fill-extrusion",
              source: "protomaps",
              "source-layer": "buildings",
              paint: {
                "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "height"], 8], 0, "#2c2825", 40, "#3b3531", 120, "#4d453e"],
                "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
                "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
                "fill-extrusion-opacity": 0.92,
              },
            },
          ],
        },
      });
      map.setPadding(PADDING);
      map.jumpTo({ center: CENTER });
      const o = new MapboxOverlay({
        interleaved: true,
        getCursor: ({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
      });
      overlay.current = o;
      map.addControl(o);
      map.on("load", () => !cancelled && setReady(true));
    });
    return () => {
      cancelled = true;
      overlay.current = null;
      setReady(false);
      map?.remove();
    };
  }, []);

  const build = useMemo(() => {
    const common = { pickable: false, parameters: { depthCompare: "always" } } as const;
    const smileys = pins.filter((p) => p.kind === "smiley");
    return (phase: number): Layer[] => {
      const rings = (id: string, url: typeof ICONS.ringSolid, data: KnownPin[]) =>
        new IconLayer<KnownPin>({ ...common, id, data, getPosition: (d) => d.position, getIcon: () => url, getSize: 74, sizeUnits: "pixels", getPixelOffset: [0, -32] });
      return [
        new IconLayer<KnownPin>({
          ...common, id: "glow", data: pins, getPosition: (d) => d.position, getPixelOffset: [0, -30],
          getIcon: (d) => (d.kind === "smiley" ? ICONS.glowRed : ICONS.glowGold), getSize: 120,
        }),
        new IconLayer<KnownPin>({
          ...common, id: "pulse", data: smileys, getPosition: (d) => d.position, getIcon: () => ICONS.pulse,
          getSize: 74, sizeScale: 0.5 + 1.3 * phase, opacity: 0.8 * (1 - phase),
        }),
        rings("ring-hover", ICONS.ringDash, pins.filter((p) => p.id === hover && p.id !== selectedPin)),
        rings("ring-linked", ICONS.ringGold, pins.filter((p) => linkedEpisode !== null && p.episode === linkedEpisode)),
        rings("ring-selected", ICONS.ringSolid, pins.filter((p) => p.id === selectedPin)),
        new IconLayer<KnownPin>({
          id: "pins", data: pins, pickable: true, parameters: common.parameters,
          getPosition: (d) => d.position, getIcon: (d) => (d.kind === "smiley" ? ICONS.smiley : ICONS.landmark),
          getSize: (d) => (d.kind === "smiley" ? 56 : 38), updateTriggers: { getSize: [pins] },
          onClick: ({ object }) => object && onSelect.current(object.id),
          onHover: ({ object }) => setHover(object?.id ?? null),
        }),
        new TextLayer<KnownPin>({
          ...common, id: "labels", data: pins, getPosition: (d) => d.position, getText: (d) => d.label,
          getSize: 14, getColor: [246, 240, 230, 255], background: true, backgroundPadding: [7, 4], getBackgroundColor: [10, 8, 8, 225], getTextAnchor: "start", getAlignmentBaseline: "center",
          getPixelOffset: (d) => (d.kind === "smiley" ? [36, -30] : [30, -20]),
          fontFamily: '"Segoe UI", sans-serif', fontSettings: { sdf: true }, outlineWidth: 2, outlineColor: [5, 4, 4, 255],
        }),
      ];
    };
  }, [pins, selectedPin, linkedEpisode, hover]);

  useEffect(() => {
    const o = overlay.current;
    if (!ready || !o) return;
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
  }, [ready, build, reducedMotion]);

  return <div ref={box} className="rr-map" role="group" aria-label="3D map of downtown Sacramento. Pins are listed in the legend panel." />;
}
