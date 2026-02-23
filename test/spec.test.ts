import { describe, expect, it } from "vitest";
import { resolveRefs, processSpec, extractTags, extractServerBasePath } from "../src/spec.js";

describe("resolveRefs", () => {
  it("resolves simple $ref", () => {
    const spec = {
      components: {
        schemas: {
          Pet: { type: "object", properties: { name: { type: "string" } } },
        },
      },
      paths: {
        "/pets": {
          get: {
            responses: {
              "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } },
            },
          },
        },
      },
    };

    const result = resolveRefs(spec.paths["/pets"]!.get.responses, spec) as any;
    expect(result["200"].content["application/json"].schema.type).toBe("object");
    expect(result["200"].content["application/json"].schema.properties.name.type).toBe("string");
  });

  it("handles circular references", () => {
    const spec = {
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              child: { $ref: "#/components/schemas/Node" },
            },
          },
        },
      },
    };

    const result = resolveRefs(spec.components.schemas.Node, spec) as any;
    expect(result.type).toBe("object");
    // First level resolves, second level detects the cycle
    expect(result.properties.child.type).toBe("object");
    expect(result.properties.child.properties.child.$circular).toBe("#/components/schemas/Node");
  });

  it("handles null and primitives", () => {
    expect(resolveRefs(null, {})).toBe(null);
    expect(resolveRefs(undefined, {})).toBe(undefined);
    expect(resolveRefs("hello", {})).toBe("hello");
    expect(resolveRefs(42, {})).toBe(42);
  });

  it("resolves arrays", () => {
    const spec = {
      components: { schemas: { Tag: { type: "string" } } },
    };
    const arr = [{ $ref: "#/components/schemas/Tag" }, "literal"];
    const result = resolveRefs(arr, spec) as any[];
    expect(result[0]).toEqual({ type: "string" });
    expect(result[1]).toBe("literal");
  });
});

describe("extractServerBasePath", () => {
  it("extracts path from relative URL", () => {
    expect(extractServerBasePath({ servers: [{ url: "/api/v3" }] } as any)).toBe("/api/v3");
  });

  it("extracts path from full URL", () => {
    expect(extractServerBasePath({ servers: [{ url: "https://petstore.io/api/v3" }] } as any)).toBe("/api/v3");
  });

  it("returns empty for root URL", () => {
    expect(extractServerBasePath({ servers: [{ url: "https://api.example.com" }] } as any)).toBe("");
  });

  it("returns empty when no servers", () => {
    expect(extractServerBasePath({})).toBe("");
    expect(extractServerBasePath({ servers: [] } as any)).toBe("");
  });

  it("strips trailing slash", () => {
    expect(extractServerBasePath({ servers: [{ url: "/api/v3/" }] } as any)).toBe("/api/v3");
  });
});

describe("processSpec", () => {
  it("extracts operations with resolved refs", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      components: {
        schemas: {
          Pet: { type: "object", properties: { name: { type: "string" } } },
        },
      },
      paths: {
        "/pets": {
          get: {
            summary: "List pets",
            tags: ["pets"],
            parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }],
          },
          post: {
            summary: "Create pet",
            requestBody: {
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Pet" } },
              },
            },
          },
        },
      },
    };

    const result = processSpec(spec);
    const pets = result.paths as any;
    expect(pets["/pets"].get.summary).toBe("List pets");
    expect(pets["/pets"].get.tags).toEqual(["pets"]);
    expect(pets["/pets"].post.summary).toBe("Create pet");
    // $ref should be resolved
    expect(pets["/pets"].post.requestBody.content["application/json"].schema.type).toBe("object");
  });

  it("prepends server base path to all path keys", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Petstore", version: "1.0.0" },
      servers: [{ url: "/api/v3" }],
      paths: {
        "/pet": { get: { summary: "Get pets" } },
        "/pet/{petId}": { get: { summary: "Get pet by ID" } },
      },
    };

    const result = processSpec(spec);
    const paths = result.paths as any;
    expect(paths["/api/v3/pet"]).toBeDefined();
    expect(paths["/api/v3/pet/{petId}"]).toBeDefined();
    expect(paths["/pet"]).toBeUndefined();
  });

  it("preserves info, omits servers", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "My API", version: "2.0.0" },
      servers: [{ url: "/api/v3" }],
      paths: {},
    };

    const result = processSpec(spec);
    expect((result as any).info.title).toBe("My API");
    expect((result as any).servers).toBeUndefined();
  });

  it("skips non-HTTP method keys", () => {
    const spec = {
      paths: {
        "/test": {
          get: { summary: "Get" },
          parameters: [{ name: "shared" }],
          description: "path-level description",
        },
      },
    };

    const result = processSpec(spec);
    const test = (result.paths as any)["/test"];
    expect(test.get).toBeDefined();
    expect(test.parameters).toBeUndefined();
    expect(test.description).toBeUndefined();
  });
});

describe("extractTags", () => {
  it("extracts tags sorted by frequency", () => {
    const spec = {
      paths: {
        "/a": { get: { tags: ["alpha", "beta"] }, post: { tags: ["alpha"] } },
        "/b": { get: { tags: ["beta"] } },
        "/c": { delete: { tags: ["gamma"] } },
      },
    };

    const tags = extractTags(spec);
    expect(tags[0]).toBe("alpha"); // 2 occurrences
    expect(tags[1]).toBe("beta");  // 2 occurrences
    expect(tags[2]).toBe("gamma"); // 1 occurrence
  });

  it("returns empty for spec without paths", () => {
    expect(extractTags({})).toEqual([]);
    expect(extractTags({ paths: {} })).toEqual([]);
  });
});
