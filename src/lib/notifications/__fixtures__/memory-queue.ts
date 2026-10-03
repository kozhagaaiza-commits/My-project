import { randomUUID } from "node:crypto";
import type { NotificationQueueRepo, QueueRow } from "@/lib/notifications/queue-repo";
import type { NotificationInput } from "@/lib/notifications/types";

// In-memory реализация NotificationQueueRepo для тестов. claim — условное обновление (status = pending, next_attempt_at ≤ dueBefore),
// как `update … where id = … and status = 'pending' and next_attempt_at <= now returning` в PostgREST.

export interface MemRow extends QueueRow {
  status: "pending" | "sent" | "failed";
  last_error: string | null;
  next_attempt_at: Date;
}

export class MemoryQueueRepo implements NotificationQueueRepo {
  readonly rows: MemRow[] = [];
  readonly clearedChats: string[] = [];
  claimCalls = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  /** Постановка как insertNotification: status pending, attempts 0, next_attempt_at = «now() БД». */
  add(n: NotificationInput, over: Partial<MemRow> = {}): MemRow {
    const row: MemRow = {
      id: randomUUID(), channel: n.channel, recipient: n.recipient, template: n.template, payload: structuredClone(n.payload),
      attempts: 0, status: "pending", last_error: null, next_attempt_at: this.clock(), ...over,
    };
    this.rows.push(row);
    return row;
  }
  enqueue = async (n: NotificationInput): Promise<boolean> => { this.add(n); return true; };
  get(id: string): MemRow { const r = this.rows.find((x) => x.id === id); if (!r) throw new Error("нет строки"); return r; }

  private view(r: MemRow): QueueRow {
    return { id: r.id, channel: r.channel, recipient: r.recipient, template: r.template, payload: structuredClone(r.payload), attempts: r.attempts };
  }
  async listDue(dueBefore: Date, limit: number) {
    return this.rows.filter((r) => r.status === "pending" && r.next_attempt_at <= dueBefore)
      .sort((a, b) => a.next_attempt_at.getTime() - b.next_attempt_at.getTime()).slice(0, limit).map((r) => this.view(r));
  }
  async claim(id: string, dueBefore: Date, leaseUntil: Date) {
    this.claimCalls++;
    const r = this.rows.find((x) => x.id === id && x.status === "pending" && x.next_attempt_at <= dueBefore);
    if (!r) return null;
    r.next_attempt_at = leaseUntil;
    return this.view(r);
  }
  async markSent(id: string, attempts: number) { Object.assign(this.get(id), { status: "sent", attempts, last_error: null }); }
  async markFailed(id: string, attempts: number, error: string) { Object.assign(this.get(id), { status: "failed", attempts, last_error: error }); }
  async reschedule(id: string, attempts: number, nextAttemptAt: Date, error: string) {
    Object.assign(this.get(id), { attempts, last_error: error, next_attempt_at: nextAttemptAt });
  }
  async countPending() { return this.rows.filter((r) => r.status === "pending").length; }
  async clearTelegramChat(chatId: string) { this.clearedChats.push(chatId); }
}
