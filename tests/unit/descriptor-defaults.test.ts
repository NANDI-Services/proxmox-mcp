import { describe, expect, it } from "vitest";
import { buildEndpointRequest } from "../../src/proxmox/descriptor.js";

describe("endpoint descriptor defaults", () => {
  it("applies query defaults when args are missing", () => {
    const req = buildEndpointRequest(
      {
        id: "metrics.node.hour",
        method: "GET",
        path: "/api2/json/nodes/{node}/rrddata",
        pathParams: ["node"],
        queryParams: ["timeframe", "cf"],
        queryDefaults: { timeframe: "hour", cf: "AVERAGE" }
      },
      { node: "pve1" }
    );

    expect(req.query?.timeframe).toBe("hour");
    expect(req.query?.cf).toBe("AVERAGE");
  });
});

