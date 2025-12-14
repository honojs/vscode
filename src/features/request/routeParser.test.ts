import { describe, expect, it } from "vitest";
import { parseRoutesFromText } from "./routeParser";

describe("parseRoutesFromText", () => {
  it("parses route method, path, and callStartIndex", () => {
    const text = [
      "import { Hono } from 'hono';",
      "const app = new Hono();",
      "app.get('/hello', (c) => c.text('ok'));"
    ].join("\n");

    const routes = parseRoutesFromText(text);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.method).toBe("get");
    expect(routes[0]?.path).toBe("/hello");

    const idx = routes[0]!.callStartIndex;
    expect(text.slice(idx, idx + 7)).toBe("app.get");
  });

  it("does not shift index to previous line when the call is at the beginning of a line", () => {
    const text = "const app = new Hono();\napp.post(\"/posts\", () => {});\n";
    const routes = parseRoutesFromText(text);
    expect(routes).toHaveLength(1);
    expect(text.slice(routes[0]!.callStartIndex, routes[0]!.callStartIndex + 8)).toBe("app.post");
  });
});


