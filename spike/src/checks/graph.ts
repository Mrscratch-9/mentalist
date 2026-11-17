import cytoscape from "cytoscape";
import type { CheckResult } from "./types";

// Synthetic graph roughly the size of a full-series relationship view.
export async function checkGraph(container: HTMLElement): Promise<CheckResult & { cy: cytoscape.Core }> {
  const N = 300;
  const E = 600;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const elements: cytoscape.ElementDefinition[] = [];
  for (let i = 0; i < N; i++) elements.push({ data: { id: `n${i}`, label: `E${i}` } });
  for (let i = 0; i < E; i++) {
    const s = Math.floor(rand() * N);
    const t = Math.floor(rand() * N);
    if (s !== t) elements.push({ data: { id: `x${i}`, source: `n${s}`, target: `n${t}` } });
  }

  const t0 = performance.now();
  const cy = cytoscape({
    container,
    elements,
    style: [
      { selector: "node", style: { "background-color": "#c9a227", width: 8, height: 8, label: "data(label)", color: "#ddd", "font-size": 5 } },
      { selector: "edge", style: { width: 0.6, "line-color": "#666" } },
    ],
    layout: { name: "cose", animate: false, randomize: true },
  });
  const layoutMs = performance.now() - t0;
  const pass = cy.nodes().length === N && cy.edges().length > 0;
  return { pass, cy, detail: `${cy.nodes().length} nodes, ${cy.edges().length} edges, cose layout ${layoutMs.toFixed(0)} ms` };
}
