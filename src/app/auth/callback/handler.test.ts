import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCallbackHandler } from "./handler";

const ok = createCallbackHandler({ exchangeCodeForSession: async () => ({ error: null }) });
const bad = createCallbackHandler({ exchangeCodeForSession: async () => ({ error: new Error("expired") }) });
const throws = createCallbackHandler({ exchangeCodeForSession: async () => { throw new Error("net"); } });
const get = (h: typeof ok, qs: string) => h(new Request(`https://forgecarbon.test/auth/callback${qs}`));
const loc = (r: Response) => r.headers.get("location");

describe("GET /auth/callback", () => {
  it("успех → next", async () => assert.equal(loc(await get(ok, "?code=abc&next=/atelier")), "https://forgecarbon.test/atelier"));
  it("без next → /account", async () => assert.equal(loc(await get(ok, "?code=abc")), "https://forgecarbon.test/account"));
  it("открытый редирект отбрасывается (Edge Case 28)", async () => {
    for (const n of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      assert.equal(loc(await get(ok, `?code=abc&next=${encodeURIComponent(n)}`)), "https://forgecarbon.test/account");
    }
  });
  it("ошибка обмена, исключение, нет code, error от Supabase → link_expired", async () => {
    const expected = "https://forgecarbon.test/auth/login?error=link_expired";
    assert.equal(loc(await get(bad, "?code=abc")), expected);
    assert.equal(loc(await get(throws, "?code=abc")), expected);
    assert.equal(loc(await get(ok, "")), expected);
    assert.equal(loc(await get(ok, "?error=access_denied&error_code=otp_expired")), expected);
  });
  it("восстановление: ошибка → страница смены пароля (покажет «Ссылка устарела»)", async () => {
    assert.equal(loc(await get(bad, "?code=abc&next=/auth/update-password")), "https://forgecarbon.test/auth/update-password");
    assert.equal(loc(await get(ok, "?code=abc&next=/auth/update-password")), "https://forgecarbon.test/auth/update-password");
  });
});
