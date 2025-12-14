import { describe, expect, it } from "vitest";
import { applyPathParams, extractPathParamNames } from "./pathParams";

describe("path params", () => {
  it("extracts unique param names in order", () => {
    expect(extractPathParamNames("/posts/page/:page")).toEqual(["page"]);
    expect(extractPathParamNames("/u/:id/posts/:id")).toEqual(["id"]);
    expect(extractPathParamNames("/:a/:b/:a")).toEqual(["a", "b"]);
  });

  it("replaces params and encodes values", () => {
    expect(applyPathParams("/posts/page/:page", { page: "2" })).toBe("/posts/page/2");
    expect(applyPathParams("/q/:term", { term: "a b" })).toBe("/q/a%20b");
    expect(applyPathParams("/u/:id/posts/:id", { id: "x" })).toBe("/u/x/posts/x");
  });
});


