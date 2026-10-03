import { kickNotificationQueue } from "@/lib/notifications/dispatch";

export async function GET() {
  const t0 = Date.now();
  await kickNotificationQueue(1, async () => {
    await new Promise((r) => setTimeout(r, 1500));
    console.error({ scope: "tmp-after", ran: true, msAfterStart: Date.now() - t0 });
  });
  return Response.json({ responded_ms: Date.now() - t0 });
}
