import {
  parseLiveViewerCount,
  parseLifecycleStatus,
  resolveStreamConfiguration,
  type LifecycleStatus,
  type StreamBindings,
} from "./stream";

interface Env extends StreamBindings {
  ASSETS: Fetcher;
  PROGRAM_URL?: string;
}

interface StreamApiResponse {
  configured: boolean;
  liveViewers?: number;
  playerUrl?: string;
  status: LifecycleStatus | "unconfigured";
}

const streamApiPath = "/api/stream";
const programApiPath = "/api/program";
const streamStatusMaxAge = 10;
const programMaxAge = 300;

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self' https://fonts.gstatic.com",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src https://*.cloudflarestream.com",
    "img-src 'self' data: https://nodeconf.eu",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "upgrade-insecure-requests",
  ].join("; "),
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

function json(data: StreamApiResponse, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": `public, max-age=${streamStatusMaxAge}, stale-while-revalidate=20`,
    },
  });
}

async function getStreamResponse(env: Env): Promise<Response> {
  const configuration = resolveStreamConfiguration(env);

  if (!configuration) {
    return json({ configured: false, status: "unconfigured" });
  }

  let status: LifecycleStatus = "unknown";
  let liveViewers: number | null = null;

  const [lifecycleResult, viewsResult] = await Promise.allSettled([
    fetchStreamJson(configuration.lifecycleUrl),
    fetchStreamJson(configuration.viewsUrl),
  ]);

  if (lifecycleResult.status === "fulfilled") {
    status = parseLifecycleStatus(lifecycleResult.value);
  }

  if (viewsResult.status === "fulfilled") {
    liveViewers = parseLiveViewerCount(viewsResult.value);
  }

  return json({
    configured: true,
    ...(liveViewers === null ? {} : { liveViewers }),
    playerUrl: configuration.playerUrl,
    status,
  });
}

async function fetchStreamJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(3_000),
  });

  if (!response.ok) {
    throw new Error(`Stream endpoint returned ${response.status}`);
  }

  return response.json();
}

async function getProgramResponse(env: Env): Promise<Response> {
  try {
    const response = await fetch(
      env.PROGRAM_URL ?? "https://nodeconf.eu/program.json",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Program endpoint returned ${response.status}`);
    }

    const program: unknown = await response.json();

    if (!isPublicProgram(program)) {
      throw new Error("Program endpoint returned an unsupported schema");
    }

    return Response.json(program, {
      headers: {
        "Cache-Control": `public, max-age=${programMaxAge}, stale-while-revalidate=3600`,
      },
    });
  } catch {
    return Response.json(
      { error: "Program unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function isPublicProgram(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 1 &&
    "timeZone" in value &&
    value.timeZone === "Europe/Rome" &&
    "days" in value &&
    Array.isArray(value.days) &&
    "speakerNames" in value &&
    value.speakerNames !== null &&
    typeof value.speakerNames === "object"
  );
}

async function getCachedResponse(
  url: URL,
  path: string,
  context: ExecutionContext,
  load: () => Promise<Response>,
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(new URL(path, url.origin), { method: "GET" });
  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const response = await load();

  if (response.ok) {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

function applySecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);

  for (const [name, value] of Object.entries(securityHeaders)) {
    secured.headers.set(name, value);
  }

  return secured;
}

export default {
  async fetch(request, env, context): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === streamApiPath || url.pathname === programApiPath) {
      if (request.method !== "GET") {
        return applySecurityHeaders(
          new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "GET" },
          }),
        );
      }

      const response = await getCachedResponse(
        url,
        url.pathname,
        context,
        () =>
          url.pathname === streamApiPath
            ? getStreamResponse(env)
            : getProgramResponse(env),
      );
      return applySecurityHeaders(response);
    }

    if (url.pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        Response.json(
          { error: "Not found" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        ),
      );
    }

    return applySecurityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
