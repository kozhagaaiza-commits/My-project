import { createClient } from "@/lib/supabase/server";
import { createCallbackHandler } from "./handler";

// Route Handler: cookies сессии выставляются через серверный клиент @supabase/ssr (setAll пишет в cookies()).
const handler = createCallbackHandler({
  exchangeCodeForSession: async (code) => {
    const supabase = await createClient();
    return supabase.auth.exchangeCodeForSession(code);
  },
});

export async function GET(request: Request) {
  return handler(request);
}
