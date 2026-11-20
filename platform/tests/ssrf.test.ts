import assert from "node:assert/strict";
import { test } from "node:test";
import { knownAtsApi, urlKey } from "../src/lib/jd/fetch.ts";
import { assertPublicHttpUrl, isBlockedAddress, UnsafeUrlError } from "../src/lib/jd/ssrf.ts";

test("adresses internes bloquées", () => {
  for (const ip of [
    "127.0.0.1", "127.255.0.9", "10.0.0.5", "172.16.4.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fe80::1", "fd00::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe",
    "[::1]", "64:ff9b::7f00:1", "n'importe quoi",
  ]) {
    assert.equal(isBlockedAddress(ip), true, `${ip} devrait être bloquée`);
  }
});

test("adresses publiques autorisées", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isBlockedAddress(ip), false, `${ip} devrait être autorisée`);
  }
});

test("assertPublicHttpUrl refuse les URL dangereuses", () => {
  for (const u of [
    "file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "http://localhost/admin",
    "http://127.0.0.1:3000", "http://[::1]/", "http://169.254.169.254/latest/meta-data/",
    "http://user:pass@example.com/", "http://example.com:22/", "http://intranet.local/", "http://service.internal/",
    "http://0x7f.0.0.1/", "http://2130706433/", "pas une url",
  ]) {
    assert.throws(() => assertPublicHttpUrl(u), UnsafeUrlError, u);
  }
  assert.equal(assertPublicHttpUrl("https://careers.example.com/jobs/1").hostname, "careers.example.com");
});

test("urlKey normalise (suivi, ancre, casse, slash final)", () => {
  const a = urlKey("https://Jobs.Example.com/role/42/?utm_source=x&b=2&a=1#apply");
  const b = urlKey("https://jobs.example.com/role/42?a=1&b=2&gclid=zzz");
  assert.equal(a, b);
  assert.notEqual(urlKey("https://jobs.example.com/role/43"), a);
  assert.equal(urlKey("pas une url"), null);
});

test("knownAtsApi reconnaît Greenhouse et Lever", () => {
  assert.deepEqual(knownAtsApi("https://boards.greenhouse.io/acme/jobs/123456"), {
    kind: "greenhouse",
    api: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123456",
  });
  assert.equal(knownAtsApi("https://jobs.lever.co/acme/123e4567-e89b-12d3-a456-426614174000")?.kind, "lever");
  assert.equal(knownAtsApi("https://example.com/jobs/1"), null);
});

test("IPv6 : 6to4, Teredo et documentation bloqués (ils peuvent embarquer une IPv4 interne)", () => {
  for (const ip of ["2002:7f00:1::1", "2002:c0a8:101::", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:db8::1"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
});
