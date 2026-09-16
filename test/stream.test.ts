import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLiveViewerCount,
  parseLifecycleStatus,
  resolveStreamConfiguration,
} from "../src/stream.ts";

test("builds Stream player and lifecycle URLs from valid bindings", () => {
  const configuration = resolveStreamConfiguration({
    STREAM_CUSTOMER_CODE: " f33zs165nr7gyfy4 ",
    STREAM_LIVE_INPUT_ID: "6b9e68b07dfee8cc2d116e4c51d6a957",
  });

  assert.deepEqual(configuration, {
    lifecycleUrl:
      "https://customer-f33zs165nr7gyfy4.cloudflarestream.com/6b9e68b07dfee8cc2d116e4c51d6a957/lifecycle",
    playerUrl:
      "https://customer-f33zs165nr7gyfy4.cloudflarestream.com/6b9e68b07dfee8cc2d116e4c51d6a957/iframe?primaryColor=%2339b54a&letterboxColor=%2314110c",
    viewsUrl:
      "https://customer-f33zs165nr7gyfy4.cloudflarestream.com/6b9e68b07dfee8cc2d116e4c51d6a957/views",
  });
});

test("rejects missing and unsafe Stream bindings", () => {
  assert.equal(resolveStreamConfiguration({}), null);
  assert.equal(
    resolveStreamConfiguration({
      STREAM_CUSTOMER_CODE: "customer.example.com/path",
      STREAM_LIVE_INPUT_ID: "6b9e68b07dfee8cc2d116e4c51d6a957",
    }),
    null,
  );
  assert.equal(
    resolveStreamConfiguration({
      STREAM_CUSTOMER_CODE: "f33zs165nr7gyfy4",
      STREAM_LIVE_INPUT_ID: "../iframe",
    }),
    null,
  );
});

test("maps lifecycle payloads to public statuses", () => {
  assert.equal(parseLifecycleStatus({ isInput: true, live: true }), "live");
  assert.equal(parseLifecycleStatus({ isInput: true, live: false }), "standby");
  assert.equal(parseLifecycleStatus({ live: "true" }), "unknown");
  assert.equal(parseLifecycleStatus(null), "unknown");
});

test("accepts only valid live viewer counts", () => {
  assert.equal(parseLiveViewerCount({ liveViewers: 113 }), 113);
  assert.equal(parseLiveViewerCount({ liveViewers: 0 }), 0);
  assert.equal(parseLiveViewerCount({ liveViewers: -1 }), null);
  assert.equal(parseLiveViewerCount({ liveViewers: 1.5 }), null);
  assert.equal(parseLiveViewerCount({ liveViewers: "113" }), null);
  assert.equal(parseLiveViewerCount(null), null);
});
