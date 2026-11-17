export type CheckResult = { pass: boolean; detail: string };
export type CheckState = CheckResult | { pass: null; detail: string };
