/**
 * Errors never echo caller-supplied or stored data (L1, L14): messages are
 * constant strings, so hidden and nonexistent IDs are indistinguishable.
 */
export class NotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "NotFoundError";
  }
}

export class InvalidInputError extends Error {
  constructor(what: "progress" | "query" | "argument") {
    super(`Invalid ${what}`);
    this.name = "InvalidInputError";
  }
}
