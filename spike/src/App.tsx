import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { checkSqlite } from "./checks/sqlite";
import { checkMap } from "./checks/map";
import { checkGraph } from "./checks/graph";
import type { CheckResult, CheckState } from "./checks/types";
import "./App.css";

type Name = "sqlite" | "map" | "graph";
const pending: CheckState = { pass: null, detail: "running…" };
const inTauri = "__TAURI_INTERNALS__" in window;

// A null check is skipped (used for RAM attribution runs).
async function run<T extends CheckResult>(f: (() => Promise<T>) | null): Promise<T | CheckResult> {
  if (!f) return { pass: true, detail: "skipped" };
  try {
    return await f();
  } catch (e) {
    return { pass: false, detail: `error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [checks, setChecks] = useState<Record<Name, CheckState>>({ sqlite: pending, map: pending, graph: pending });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const [enabled, mapOpts] = inTauri ? await invoke<[string, string]>("spike_config") : ["sqlite,map,graph", ""];
      const on = (n: Name) => enabled.split(",").includes(n);
      const [sqlite, map, graph] = await Promise.all([
        run(on("sqlite") ? checkSqlite : null),
        run(on("map") ? () => checkMap(mapRef.current!, mapOpts) : null),
        run(on("graph") ? () => checkGraph(graphRef.current!) : null),
      ]);
      const results = { sqlite, map: { pass: map.pass, detail: map.detail }, graph: { pass: graph.pass, detail: graph.detail } };
      setChecks(results);
      if (!inTauri) return;
      const files: Record<string, string> = { "checks.json": JSON.stringify({ userAgent: navigator.userAgent, results }, null, 2) };
      if ("map" in map && !mapOpts.includes("lite")) files["map.png.b64"] = map.map.getCanvas().toDataURL("image/png").split(",")[1];
      if ("cy" in graph) files["graph.png.b64"] = graph.cy.png({ output: "base64", bg: "#111", scale: 2 });
      await invoke("report", { files });
    })();
  }, []);

  return (
    <main className="spike">
      <section className="board">
        <h1>Foundation spike</h1>
        {(Object.keys(checks) as Name[]).map((k) => (
          <div key={k} className={`check ${checks[k].pass === null ? "run" : checks[k].pass ? "ok" : "fail"}`}>
            <strong>{k}</strong> {checks[k].pass === null ? "…" : checks[k].pass ? "PASS" : "FAIL"}
            <p>{checks[k].detail}</p>
          </div>
        ))}
        <div ref={graphRef} className="graph" />
      </section>
      <div ref={mapRef} className="map" />
    </main>
  );
}

export default App;
