import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAuthError } from "./auth-client";

describe("classifyAuthError", () => {
  it("коды и сообщения Supabase → причины", () => {
    assert.equal(classifyAuthError({ code: "invalid_credentials" }), "invalid_credentials");
    assert.equal(classifyAuthError({ message: "Invalid login credentials" }), "invalid_credentials");
    assert.equal(classifyAuthError({ message: "Email not confirmed" }), "email_not_confirmed");
    assert.equal(classifyAuthError({ code: "user_already_exists" }), "already_registered");
    assert.equal(classifyAuthError({ status: 429 }), "rate_limited");
    assert.equal(classifyAuthError({ code: "over_email_send_rate_limit" }), "rate_limited");
    assert.equal(classifyAuthError({ message: "Auth session missing!" }), "link_expired");
    assert.equal(classifyAuthError({ code: "same_password" }), "same_password");
    assert.equal(classifyAuthError({ message: "boom" }), "unknown");
  });
});
