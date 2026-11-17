import { useEffect, useState } from "react";
import { checksRequested } from "./runtime";
import { ChecksBoard } from "./checks/ChecksBoard";
import { RedRoom } from "./redroom/RedRoom";
import "./App.css";

// Red room by default; the stack checks board only when requested (see runtime.ts).
function App() {
  const [checks, setChecks] = useState<boolean | null>(null);
  useEffect(() => {
    checksRequested().then(setChecks, () => setChecks(false));
  }, []);
  if (checks === null) return null;
  return checks ? <ChecksBoard /> : <RedRoom />;
}

export default App;
