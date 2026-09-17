# NodeConf EU 2026 Live

The Cloudflare Worker for `live.nodeconf.eu`. It serves a responsive broadcast page in the NodeConf EU 2026 visual language and embeds the active Cloudflare Stream Live broadcast.

## Architecture

- Cloudflare Workers Static Assets serves the HTML, CSS, JavaScript, and event mark without invoking the Worker script.
- `GET /api/stream` builds the Stream Player URL from Worker bindings and checks the Live Input lifecycle and live viewer count concurrently.
- `GET /api/program` proxies the versioned program feed published by the main NodeConf EU Worker and caches it for five minutes.
- The browser polls that endpoint every 15 seconds to keep the on-air indicator and viewer count current.
- The current/next panel advances against the published schedule in the `Europe/Rome` timezone and refreshes its source data every five minutes.
- While the Live Input reports `standby`, the page keeps the Stream iframe unmounted and shows the branded fallback; it mounts the player automatically when the broadcast becomes live.
- Stream status responses are cached at the edge for 10 seconds so viewer traffic does not become one analytics request per viewer.
- The stable Live Input ID is used instead of a per-broadcast Video ID, so one page follows the active broadcast across both conference days.

There is no frontend framework or runtime dependency. Cloudflare's hosted Stream Player handles adaptive playback and the live-input standby state.

## Prerequisites

- Node.js 24 or newer
- Access to the `nodeconf.eu` Cloudflare account
- A Cloudflare Stream Live Input

## Stream Setup

Create a Live Input in the Cloudflare dashboard, then collect these public playback identifiers:

- `STREAM_CUSTOMER_CODE`: the customer code from the Stream Player embed URL
- `STREAM_LIVE_INPUT_ID`: the stable Live Input UID, not a generated recording/video UID and never the Stream Key
- `STREAM_FAILOVER_LIVE_INPUT_ID`: an optional backup Live Input UID that takes precedence when set to a valid value

For local development, create `.dev.vars`:

```dotenv
STREAM_CUSTOMER_CODE=your-customer-code
STREAM_LIVE_INPUT_ID=your-live-input-id
STREAM_FAILOVER_LIVE_INPUT_ID=
```

The Stream Key is only used by the encoder, such as OBS, and must not be added to this project.

The production playback identifiers are committed as plain-text Worker variables in `wrangler.jsonc`. The values are included in the public player URL, so they are not secrets. Update them there if the conference moves to a different Live Input.

For emergency failover, add `STREAM_FAILOVER_LIVE_INPUT_ID` under the Worker's dashboard variables and deploy the variable change. The browser will receive the alternate player after the 10-second edge cache expires and replace its iframe on the next 15-second poll. Delete the variable and deploy that change to return to the primary input. The backup must belong to the same Stream account and have matching playback and allowed-origin settings. `/api/stream` reports `"source":"failover"` when the override is active.

`PROGRAM_URL` points to `https://nodeconf.eu/program.json`. For end-to-end local work with the main site running on port 3001, override it when starting Wrangler:

```bash
npm run dev -- --var PROGRAM_URL:http://localhost:3001/program.json
```

If Stream hotlink protection is enabled, add `live.nodeconf.eu` to the Live Input recording settings' allowed origins. Add the local Wrangler origin while testing locally, for example `localhost:8787`, then remove it before the event if it is no longer needed.

Player helper links open `/#player-frame` on the live site rather than navigating directly to `cloudflarestream.com`, so they remain compatible with the allowed-origin restriction.

## Development

```bash
npm install
npm run dev
```

Wrangler serves the project at `http://localhost:8787`. Without the two Stream variables, the page intentionally renders its attendee-facing standby treatment rather than a broken player.

## Validation

```bash
npm run check
npm run build
```

`npm run check` runs strict TypeScript checking and the Stream configuration unit tests. `npm run build` also performs a Wrangler dry-run deployment and writes its output to `dist/`.

## Deployment

```bash
npm run deploy
```

`wrangler.jsonc` targets the same Cloudflare account as the primary NodeConf EU site and registers `live.nodeconf.eu` as a Worker Custom Domain. Cloudflare creates the DNS record and certificate during deployment. An existing CNAME for `live.nodeconf.eu` must be removed before the first deployment because Custom Domains cannot replace an existing CNAME.

Before conference day, verify all of the following from a non-authenticated browser:

1. Start a short test broadcast through the production Live Input.
2. Confirm the page changes from **Stream not started** to **Live now**.
3. Confirm video, audio, quality switching, and full-screen playback on desktop and mobile.
4. Stop the encoder and confirm the player returns to Stream's idle state.
5. Check the recording in Stream after it finishes processing.
