/** Cloudflare Worker entry point for the Mwalimu Sites deployment. */
import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

import { handleRequest as handleApiRequest } from "../src/index.js";

interface Env {
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  ACCESS_CODE?: string;
  DEFAULT_REALTIME_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  return new Response(response.body, { status: response.status, headers });
}

async function fetchAsset(env: Env, request: Request, path?: string) {
  const assetRequest = path
    ? new Request(new URL(path, request.url), request)
    : request;
  return env.ASSETS.fetch(assetRequest);
}

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) => fetchAsset(env, request, path),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    if (url.pathname === "/") {
      const app = await fetchAsset(env, request, "/index.html");
      if (app.ok) return withSecurityHeaders(app);
    }

    const asset = await fetchAsset(env, request);
    if (asset.status !== 404) return withSecurityHeaders(asset);

    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
};

export default worker;
