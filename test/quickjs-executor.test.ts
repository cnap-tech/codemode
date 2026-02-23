import { describe, it, expect } from "vitest";
import { QuickJSExecutor } from "../src/executor/quickjs.js";
import { CodeMode } from "../src/codemode.js";

describe("QuickJSExecutor", () => {
  it("executes simple code", async () => {
    const executor = new QuickJSExecutor();
    const result = await executor.execute(
      `async () => 1 + 2`,
      {},
    );
    expect(result.result).toBe(3);
    expect(result.error).toBeUndefined();
  });

  it("injects and reads data globals", async () => {
    const executor = new QuickJSExecutor();
    const result = await executor.execute(
      `async () => spec.info.title`,
      {
        spec: {
          openapi: "3.0.0",
          info: { title: "My API", version: "1.0.0" },
          paths: {},
        },
      },
    );
    expect(result.result).toBe("My API");
  });

  it("injects async host functions in a namespace", async () => {
    const executor = new QuickJSExecutor();
    const result = await executor.execute(
      `async () => {
        var res = api.request({ method: "GET", path: "/test" });
        return res;
      }`,
      {
        api: {
          request: async (opts: any) => ({
            status: 200,
            body: { message: "hello from " + opts.path },
          }),
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      status: 200,
      body: { message: "hello from /test" },
    });
  });

  it("console.log is a no-op (does not crash)", async () => {
    const executor = new QuickJSExecutor();
    const result = await executor.execute(
      `async () => {
        console.log("hello", "world");
        console.warn("warning!");
        console.error("error!");
        return 42;
      }`,
      {},
    );
    expect(result.result).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it("returns error for invalid code", async () => {
    const executor = new QuickJSExecutor();
    const result = await executor.execute(
      `not valid code!!!`,
      {},
    );
    expect(result.error).toBeDefined();
  });

  it("enforces memory limits", async () => {
    const executor = new QuickJSExecutor({ memoryMB: 1 });
    const result = await executor.execute(
      `async () => {
        var arr = [];
        for (var i = 0; i < 10000000; i++) {
          arr.push("x".repeat(1000));
        }
        return arr.length;
      }`,
      {},
    );
    // Memory limit enforcement: either returns an error or the result is not the full 10M length
    const hasError = result.error !== undefined;
    const incompleteResult = result.result !== 10000000;
    expect(hasError || incompleteResult).toBe(true);
  });

  it("enforces timeout", async () => {
    const executor = new QuickJSExecutor({ timeoutMs: 100 });
    const start = Date.now();
    const result = await executor.execute(
      `async () => { while(true) {} }`,
      {},
    );
    const elapsed = Date.now() - start;
    // Should not run forever - either errors or completes within reasonable time
    const hasError = result.error !== undefined;
    const terminatedQuickly = elapsed < 5000;
    expect(hasError || terminatedQuickly).toBe(true);
  });
});

describe("CodeMode with QuickJSExecutor", () => {
  it("full search + execute flow", async () => {
    const { Hono } = await import("hono");
    const app = new Hono();

    app.get("/v1/clusters", (c) =>
      c.json([
        { id: "eu", name: "EU Prod" },
        { id: "us", name: "US Staging" },
      ]),
    );
    app.get("/v1/clusters/:id", (c) =>
      c.json({ id: c.req.param("id"), name: "Cluster Detail" }),
    );

    const spec = {
      openapi: "3.0.0",
      info: { title: "CNAP API", version: "1.0.0" },
      paths: {
        "/v1/clusters": {
          get: { summary: "List clusters", operationId: "listClusters" },
        },
        "/v1/clusters/{id}": {
          get: { summary: "Get cluster by ID", operationId: "getCluster" },
        },
        "/v1/products": {
          get: { summary: "List products", operationId: "listProducts" },
          post: { summary: "Create product", operationId: "createProduct" },
        },
      },
    };

    const codemode = new CodeMode({
      spec,
      request: app.request.bind(app),
      namespace: "cnap",
      executor: new QuickJSExecutor({ memoryMB: 32, timeoutMs: 10_000 }),
    });

    // Search: find cluster endpoints
    const searchResult = await codemode.search(`
      async () => {
        var results = [];
        var entries = Object.entries(spec.paths);
        for (var i = 0; i < entries.length; i++) {
          var path = entries[i][0];
          var methods = entries[i][1];
          if (path.indexOf('/clusters') !== -1) {
            var methodEntries = Object.entries(methods);
            for (var j = 0; j < methodEntries.length; j++) {
              var method = methodEntries[j][0];
              var op = methodEntries[j][1];
              results.push({
                method: method.toUpperCase(),
                path: path,
                summary: op.summary,
              });
            }
          }
        }
        return results;
      }
    `);

    expect(searchResult.isError).toBeUndefined();
    const endpoints = JSON.parse(searchResult.content[0]!.text);
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].summary).toBe("List clusters");

    // Execute: list clusters
    const execResult = await codemode.execute(`
      async () => {
        var res = cnap.request({ method: "GET", path: "/v1/clusters" });
        return res.body;
      }
    `);

    expect(execResult.isError).toBeUndefined();
    const clusters = JSON.parse(execResult.content[0]!.text);
    expect(clusters).toEqual([
      { id: "eu", name: "EU Prod" },
      { id: "us", name: "US Staging" },
    ]);

    // Execute: get specific cluster
    const detailResult = await codemode.execute(`
      async () => {
        var clusters = cnap.request({ method: "GET", path: "/v1/clusters" });
        var first = clusters.body[0];
        var detail = cnap.request({ method: "GET", path: "/v1/clusters/" + first.id });
        return detail.body;
      }
    `);

    expect(detailResult.isError).toBeUndefined();
    const detail = JSON.parse(detailResult.content[0]!.text);
    expect(detail.id).toBe("eu");
  });
});
