# NodeConf EU 2026 Live

The Cloudflare Worker for `live.nodeconf.eu`. It serves a responsive broadcast page in the NodeConf EU 2026 visual language and embeds the active Cloudflare Stream Live broadcast.

## Architecture

- Cloudflare Workers Static Assets serves the HTML, CSS, JavaScript, and event mark without invoking the Worker script.
- `GET /api/stream` builds the Stream Player URL from Worker bindings and checks the Live Input lifecycle.
- The browser polls that endpoint every 15 seconds to keep the on-air indicator current.
- Lifecycle responses are cached at the edge for 10 seconds so viewer traffic does not become one Stream lifecycle request per viewer.
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

For local development, create `.dev.vars`:

```dotenv
STREAM_CUSTOMER_CODE=your-customer-code
STREAM_LIVE_INPUT_ID=your-live-input-id
```

The Stream Key is only used by the encoder, such as OBS, and must not be added to this project.

The production playback identifiers are committed as plain-text Worker variables in `wrangler.jsonc`. The values are included in the public player URL, so they are not secrets. Update them there if the conference moves to a different Live Input.

If Stream hotlink protection is enabled, add `live.nodeconf.eu` to the Live Input recording settings' allowed origins. Add the local Wrangler origin while testing locally, for example `localhost:8787`, then remove it before the event if it is no longer needed.

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
