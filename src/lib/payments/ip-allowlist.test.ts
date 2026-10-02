import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstForwardedIp, isYookassaIp, parseIPv4, parseIPv6 } from "@/lib/payments/ip-allowlist";

const yes = (ips: string[]) => { for (const ip of ips) assert.equal(isYookassaIp(ip), true, ip); };
const no = (ips: Array<string | null | undefined>) => { for (const ip of ips) assert.equal(isYookassaIp(ip), false, String(ip)); };

describe("isYookassaIp: IPv4-сети ЮKassa (границы подсетей)", () => {
  it("185.71.76.0/27 и 185.71.77.0/27", () => {
    yes(["185.71.76.0", "185.71.76.1", "185.71.76.31", "185.71.77.0", "185.71.77.31"]);
    no(["185.71.76.32", "185.71.75.255", "185.71.77.32", "185.71.78.0"]);
  });
  it("77.75.153.0/25 и 77.75.154.128/25", () => {
    yes(["77.75.153.0", "77.75.153.127", "77.75.154.128", "77.75.154.255"]);
    no(["77.75.153.128", "77.75.152.255", "77.75.154.127", "77.75.155.0"]);
  });
  it("одиночные 77.75.156.11 и 77.75.156.35", () => {
    yes(["77.75.156.11", "77.75.156.35"]);
    no(["77.75.156.10", "77.75.156.12", "77.75.156.34", "77.75.156.36"]);
  });
});

describe("isYookassaIp: IPv6 2a02:5180::/32 и IPv4-mapped", () => {
  it("сокращённая и полная запись, регистр", () => {
    yes(["2a02:5180::", "2a02:5180::1", "2A02:5180:0:0:0:0:0:1", "2a02:5180:0000:0000:0000:0000:0000:0001",
      "2a02:5180:ffff:ffff:ffff:ffff:ffff:ffff", "2a02:5180:1:2:3:4:5::"]);
    no(["2a02:5181::", "2a02:517f:ffff:ffff:ffff:ffff:ffff:ffff", "2a02::5180", "::1", "fe80::1"]);
  });
  it("IPv4-mapped (::ffff:a.b.c.d и hex-запись) проверяется по IPv4-сетям", () => {
    yes(["::ffff:185.71.76.5", "::FFFF:77.75.156.35", "0:0:0:0:0:ffff:185.71.76.5", "::ffff:b947:4c05"]);
    no(["::ffff:8.8.8.8", "::ffff:185.71.76.32", "::185.71.76.5"]);
  });
});

describe("isYookassaIp: мусор → false", () => {
  it("пустые и невалидные значения", () => {
    no([null, undefined, "", "   ", "abc", "unknown", "185.71.76", "185.71.76.5.1", "185.71.76.256", "185.071.076.005",
      "-1.71.76.5", "185.71.76.5:443", "185.71.76.0/27", "2a02:5180::1::2", "2a02:5180:::1", "[2a02:5180::1]",
      "2a02:5180::1%eth0", "1:2:3:4:5:6:7:8:9", "2a02:5180:1:2:3:4:5:6::", "2a02:5180:1:2:3:4:5", "2a02:51800::",
      "::ffff:185.71.76", "185.71.76.5, 10.0.0.1"]);
  });
  it("пробелы по краям допускаются", () => yes([" 185.71.76.5 "]));
});

describe("разбор адресов", () => {
  it("parseIPv4 / parseIPv6", () => {
    assert.equal(parseIPv4("185.71.76.0"), 185 * 2 ** 24 + 71 * 2 ** 16 + 76 * 2 ** 8);
    assert.equal(parseIPv4("0.0.0.0"), 0);
    assert.equal(parseIPv4("01.2.3.4"), null);
    assert.equal(parseIPv6("::"), BigInt(0));
    assert.equal(parseIPv6("::1"), BigInt(1));
    assert.equal(parseIPv6("1::"), BigInt(1) << BigInt(112));
    assert.equal(parseIPv6(":::"), null);
  });
  it("firstForwardedIp: первый адрес x-forwarded-for", () => {
    assert.equal(firstForwardedIp("185.71.76.5, 10.0.0.1"), "185.71.76.5");
    assert.equal(firstForwardedIp(" 2a02:5180::7 "), "2a02:5180::7");
    assert.equal(firstForwardedIp(null), "");
    assert.equal(firstForwardedIp(""), "");
  });
});
