import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireInviteSender } from "./inviteRequestAuth.js";

describe("requireInviteSender", () => {
  it("rejects requests without Authorization Bearer token", async () => {
    const prevUrl = process.env.VITE_SUPABASE_URL;
    const prevAnon = process.env.VITE_SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
    try {
      const result = await requireInviteSender({ headers: {} });
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
      assert.match(String(result.error || ""), /Authentification requise/);
    } finally {
      if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = prevUrl;
      if (prevAnon === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
      else process.env.VITE_SUPABASE_ANON_KEY = prevAnon;
    }
  });

  it("fails closed when Supabase env is missing", async () => {
    const prevUrl = process.env.VITE_SUPABASE_URL;
    const prevAnon = process.env.VITE_SUPABASE_ANON_KEY;
    const prevNextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const prevSupabaseUrl = process.env.SUPABASE_URL;
    const prevNextAnon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    const prevAnonAlt = process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    try {
      const result = await requireInviteSender({
        headers: { authorization: "Bearer fake-token" },
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 503);
    } finally {
      if (prevUrl === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = prevUrl;
      if (prevAnon === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
      else process.env.VITE_SUPABASE_ANON_KEY = prevAnon;
      if (prevNextUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prevNextUrl;
      if (prevSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = prevSupabaseUrl;
      if (prevNextAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = prevNextAnon;
      if (prevAnonAlt === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = prevAnonAlt;
    }
  });
});
