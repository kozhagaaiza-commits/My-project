// Проверка IP отправителя HTTP-уведомлений ЮKassa (Чертёж, Блок 3 «POST /api/webhooks/yookassa», шаг 1).
// Чистый модуль без зависимостей: IPv4 CIDR, одиночные адреса, IPv6 CIDR (включая сокращение `::`)
// и IPv4-mapped IPv6 (`::ffff:185.71.76.5`). Любой мусор → false.

const V4_NETS: ReadonlyArray<readonly [string, number]> = [
  ["185.71.76.0", 27],
  ["185.71.77.0", 27],
  ["77.75.153.0", 25],
  ["77.75.154.128", 25],
  ["77.75.156.11", 32],
  ["77.75.156.35", 32],
];
const V6_NETS: ReadonlyArray<readonly [string, number]> = [["2a02:5180::", 32]];

/** IPv4 → 32-битное число; null для невалидной записи (в т.ч. ведущие нули, лишние октеты). */
export function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** IPv6 → 128-битное BigInt; поддерживает `::` и хвост в виде IPv4. null для невалидной записи. */
export function parseIPv6(ip: string): bigint | null {
  if (!/^[0-9a-fA-F:.]+$/.test(ip)) return null; // без зоны (%eth0), скобок, портов
  const halves = ip.split("::");
  if (halves.length > 2) return null;

  const toGroups = (s: string, allowV4Tail: boolean): number[] | null => {
    if (s === "") return [];
    const raw = s.split(":");
    const out: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const g = raw[i];
      if (allowV4Tail && i === raw.length - 1 && g.includes(".")) {
        const v4 = parseIPv4(g);
        if (v4 === null) return null;
        out.push(Math.floor(v4 / 65536), v4 % 65536);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  let groups: number[];
  if (halves.length === 2) {
    const head = toGroups(halves[0], false);
    const tail = toGroups(halves[1], true);
    if (!head || !tail) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // `::` заменяет минимум одну группу
    groups = [...head, ...Array<number>(missing).fill(0), ...tail];
  } else {
    const all = toGroups(ip, true);
    if (!all || all.length !== 8) return null;
    groups = all;
  }
  return groups.reduce((acc, g) => (acc << BigInt(16)) | BigInt(g), BigInt(0));
}

function inV4(ip: number, net: string, prefix: number): boolean {
  const base = parseIPv4(net);
  if (base === null) return false;
  const size = 2 ** (32 - prefix);
  return Math.floor(ip / size) === Math.floor(base / size);
}

function inV6(ip: bigint, net: string, prefix: number): boolean {
  const base = parseIPv6(net);
  if (base === null) return false;
  const shift = BigInt(128 - prefix);
  return ip >> shift === base >> shift;
}

const V4_MAPPED_PREFIX = BigInt(0xffff) << BigInt(32);
const LOW32 = (BigInt(1) << BigInt(32)) - BigInt(1);

/** true — адрес из сетей ЮKassa. Пустая строка, мусор, IP с портом или зоной → false. */
export function isYookassaIp(ip: string | null | undefined): boolean {
  const s = (ip ?? "").trim();
  if (!s) return false;
  if (!s.includes(":")) {
    const v4 = parseIPv4(s);
    return v4 !== null && V4_NETS.some(([net, p]) => inV4(v4, net, p));
  }
  const v6 = parseIPv6(s);
  if (v6 === null) return false;
  if (v6 >> BigInt(32) === V4_MAPPED_PREFIX >> BigInt(32)) {
    const v4 = Number(v6 & LOW32); // ::ffff:a.b.c.d — тот же IPv4
    return V4_NETS.some(([net, p]) => inV4(v4, net, p));
  }
  return V6_NETS.some(([net, p]) => inV6(v6, net, p));
}

/** Первый адрес из x-forwarded-for (его выставляет Vercel); нет заголовка → "". */
export function firstForwardedIp(header: string | null): string {
  return header?.split(",")[0]?.trim() ?? "";
}
