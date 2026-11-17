// Demo data for the Red room. Placeholder content, not series data.
// Every item carries the episode where it becomes visible; `knownAt` mimics the progress-gated
// queries of the future packages/core: nothing outside the returned view may reach the UI.

export type Silhouette = "jane" | "cbi";
export type LngLat = [number, number];

export const SEASON_LENGTH = 6;

interface EpisodeRow { n: number; title: string; silhouette: Silhouette }
interface PinRow {
  id: string;
  label: string;
  kind: "smiley" | "landmark";
  position: LngLat;
  visibleFrom: number; // episode where the pin becomes visible
  episode: number | null; // case it belongs to
  description: string;
}

const EPISODES: EpisodeRow[] = [
  { n: 1, title: "Pilot", silhouette: "jane" },
  { n: 2, title: "Red Hair and Silver Tape", silhouette: "cbi" },
  { n: 3, title: "Red Tide", silhouette: "jane" },
  { n: 4, title: "Ladies in Red", silhouette: "cbi" },
  { n: 5, title: "Redwood", silhouette: "jane" },
  { n: 6, title: "Red Handed", silhouette: "cbi" },
];

const PINS: PinRow[] = [
  {
    id: "hq", label: "CBI Headquarters, Sacramento", kind: "landmark", position: [-121.4990, 38.5768],
    visibleFrom: 1, episode: null,
    description: "Landmark. Where the consultant works with the team. Always visible.",
  },
  {
    id: "a", label: "Scene A (demo)", kind: "smiley", position: [-121.5060, 38.5815],
    visibleFrom: 2, episode: 2,
    description: "Demo pin: a place where the smiley was left. Placeholder text, not series data.",
  },
  {
    id: "b", label: "Scene B (demo)", kind: "smiley", position: [-121.4960, 38.5730],
    visibleFrom: 4, episode: 4,
    description: "Demo pin: a second place where the smiley was left. Placeholder text, not series data.",
  },
];

export interface KnownEpisode {
  n: number;
  title: string; // season, number and title are always visible
  silhouette: Silhouette | null; // only once the case is solved (episode <= progress)
  solved: boolean;
}
export type KnownPin = Omit<PinRow, "visibleFrom">;
export interface Known { episodes: KnownEpisode[]; pins: KnownPin[] }

export function knownAt(progress: number): Known {
  return {
    episodes: EPISODES.map((e) => {
      const solved = e.n <= progress;
      return { n: e.n, title: e.title, solved, silhouette: solved ? e.silhouette : null };
    }),
    pins: PINS.filter((p) => p.visibleFrom <= progress).map(({ visibleFrom: _v, ...p }) => p),
  };
}

// Premise only: names and roles, no plot.
export const CHARACTERS = [
  { initials: "PJ", name: "Patrick Jane", role: "Consultant" },
  { initials: "TL", name: "Teresa Lisbon", role: "Senior agent" },
  { initials: "KC", name: "Kimball Cho", role: "Agent" },
  { initials: "WR", name: "Wayne Rigsby", role: "Agent" },
  { initials: "GV", name: "Grace Van Pelt", role: "Agent" },
];

export const epLabel = (n: number) => `S1 · E${n}`;
