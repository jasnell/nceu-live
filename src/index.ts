import {
  parseLifecycleStatus,
  resolveStreamConfiguration,
  type LifecycleStatus,
  type StreamBindings,
} from "./stream";

interface Env extends StreamBindings {
  ASSETS: Fetcher;
}

interface StreamApiResponse {
  configured: boolean;
  playerUrl?: string;
  status: LifecycleStatus | "unconfigured";
}

const streamApiPath = "/api/stream";
const streamStatusMaxAge = 10;

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

  try {
    const lifecycleResponse = await fetch(configuration.lifecycleUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
    });

    if (lifecycleResponse.ok) {
      status = parseLifecycleStatus(await lifecycleResponse.json());
    }
  } catch {
    // The player remains usable when the optional lifecycle check is unavailable.
  }

  return json({
    configured: true,
    playerUrl: configuration.playerUrl,
    status,
  });
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

    if (url.pathname === streamApiPath) {
      if (request.method !== "GET") {
        return applySecurityHeaders(
          new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "GET" },
          }),
        );
      }

      const cache = caches.default;
      const cacheKey = new Request(new URL(streamApiPath, url.origin), {
        method: "GET",
      });
      const cached = await cache.match(cacheKey);

      if (cached) {
        return applySecurityHeaders(cached);
      }

      const response = await getStreamResponse(env);
      context.waitUntil(cache.put(cacheKey, response.clone()));
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
