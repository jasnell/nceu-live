export interface StreamBindings {
  STREAM_CUSTOMER_CODE?: string;
  STREAM_LIVE_INPUT_ID?: string;
}

export type LifecycleStatus = "live" | "standby" | "unknown";

export interface StreamConfiguration {
  lifecycleUrl: string;
  playerUrl: string;
}

const safePathSegment = /^[a-z0-9_-]{8,128}$/i;

export function resolveStreamConfiguration(
  bindings: StreamBindings,
): StreamConfiguration | null {
  const customerCode = bindings.STREAM_CUSTOMER_CODE?.trim();
  const inputId = bindings.STREAM_LIVE_INPUT_ID?.trim();

  if (
    !customerCode ||
    !inputId ||
    !safePathSegment.test(customerCode) ||
    !safePathSegment.test(inputId)
  ) {
    return null;
  }

  const streamOrigin = `https://customer-${customerCode.toLowerCase()}.cloudflarestream.com`;
  const playerUrl = new URL(`/${inputId}/iframe`, streamOrigin);
  playerUrl.searchParams.set("primaryColor", "#39b54a");
  playerUrl.searchParams.set("letterboxColor", "#14110c");

  return {
    lifecycleUrl: new URL(`/${inputId}/lifecycle`, streamOrigin).toString(),
    playerUrl: playerUrl.toString(),
  };
}

export function parseLifecycleStatus(value: unknown): LifecycleStatus {
  if (!value || typeof value !== "object" || !("live" in value)) {
    return "unknown";
  }

  const { live } = value as { live?: unknown };

  if (live === true) {
    return "live";
  }

  if (live === false) {
    return "standby";
  }

  return "unknown";
}
