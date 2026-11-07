import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  withSecurityHeaders,
} from "../lib/security-headers";

describe("security headers", () => {
  it("keeps the status, body and existing headers", async () => {
    const original = new Response("corpo", {
      status: 201,
      statusText: "Created",
      headers: { "x-original": "sim" },
    });

    const wrapped = withSecurityHeaders(original);

    expect(wrapped.status).toBe(201);
    expect(wrapped.statusText).toBe("Created");
    expect(wrapped.headers.get("x-original")).toBe("sim");
    expect(await wrapped.text()).toBe("corpo");
  });

  it("adds a CSP without unsafe-eval or a frame-ancestors lock", () => {
    const response = withSecurityHeaders(new Response("ok"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toBe(CONTENT_SECURITY_POLICY);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("frame-ancestors");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers.get("X-Content-Type-Options")).toBe(
      SECURITY_HEADERS["X-Content-Type-Options"],
    );
  });

  it("does not overwrite a header already set upstream", () => {
    const response = withSecurityHeaders(
      new Response("ok", { headers: { "Referrer-Policy": "no-referrer" } }),
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});
