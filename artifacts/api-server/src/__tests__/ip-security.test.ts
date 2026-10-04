import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  geo: { country: "BR", city: "" } as { country: string; city: string } | null,
  block: null as Record<string, unknown> | null,
  deleted: vi.fn(),
  inserted: vi.fn(),
  updated: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("geoip-lite", () => ({ default: { lookup: () => state.geo } }));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@workspace/db", () => ({
  ipBlocksTable: { ip: "ip", isBanned: "is_banned" },
  ipWhitelistTable: { ip: "ip", id: "id" },
  ipLogsTable: {},
  usersTable: {},
  db: {
    select: () => ({
      from: (table: { ip?: string; id?: string }) => ({
        where: () => ({ limit: async () => table.id ? [] : state.block ? [state.block] : [] }),
      }),
    }),
    delete: () => ({ where: state.deleted }),
    insert: () => ({
      values: (values: unknown) => {
        state.inserted(values);
        const result = Promise.resolve();
        return Object.assign(result, { onConflictDoUpdate: async () => {} });
      },
    }),
    update: () => ({ set: (values: unknown) => {
      state.updated(values);
      return { where: async () => {} };
    } }),
  },
}));

import { checkIpStatus, geolocate, getClientIp, handleFailedLogin, normalizeIp } from "../lib/ip-security";

describe("País brasileiro tem prioridade sobre bloqueios de IP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.geo = { country: "BR", city: "" };
    state.block = null;
    vi.stubGlobal("fetch", state.fetch);
  });

  it.each([
    "2804:10fc:60d:cd00:28be:33bf:3ac8:b135",
    "2804:10FC:060D:CD00:28BE:33BF:3AC8:B135",
    "200.160.2.3",
  ])("libera imediatamente %s apesar de bloqueio antigo estrangeiro", async ip => {
    state.block = { attempts: 10, isForeign: true, isBanned: false, unblockAt: null };
    expect(await checkIpStatus(ip)).toEqual({ status: "ok" });
    expect(state.deleted).toHaveBeenCalledOnce();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("país Brasil confirmado tem prioridade até sobre banimento antigo", async () => {
    state.block = { attempts: 10, isBanned: true };
    expect(await checkIpStatus("2804:10fc::1")).toEqual({ status: "ok" });
    expect(state.deleted).toHaveBeenCalledOnce();
  });

  it("falhas de senha não recriam bloqueio para Brasil", async () => {
    state.block = { attempts: 3, isForeign: true, isBanned: true };
    expect(await handleFailedLogin("2804:10fc::2")).toBe(false);
    expect(state.deleted).toHaveBeenCalledOnce();
    expect(state.inserted).not.toHaveBeenCalled();
    expect(state.updated).not.toHaveBeenCalled();
  });

  it("preserva bloqueio e banimento para país estrangeiro confirmado", async () => {
    state.geo = { country: "US", city: "" };
    state.block = { attempts: 3, isForeign: true, isBanned: false, unblockAt: null };
    expect(await checkIpStatus("2600::1")).toEqual({ status: "blocked", isForeign: true, unblockAt: null });
    state.block.isBanned = true;
    expect(await checkIpStatus("2600::1")).toEqual({ status: "banned" });
    expect(state.deleted).not.toHaveBeenCalled();
  });

  it("não considera uma única tentativa estrangeira como bloqueio", async () => {
    state.geo = { country: "US", city: "" };
    state.block = { attempts: 1, isBanned: false, unblockAt: null };
    expect(await checkIpStatus("2600::2")).toEqual({ status: "ok" });
  });

  it("mantém limite de três falhas para origem estrangeira", async () => {
    state.geo = { country: "US", city: "" };
    state.block = { attempts: 2, isBanned: false };
    expect(await handleFailedLogin("2600::3")).toBe(true);
    expect(state.updated).toHaveBeenCalledWith(expect.objectContaining({ attempts: 3, isForeign: true }));
  });

  it("IPv6 sem cobertura local usa HTTPS e libera Brasil", async () => {
    state.geo = null;
    state.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      success: true, country: "Brazil", country_code: "BR", city: "Caxias do Sul",
    }) });
    expect(await checkIpStatus("2804:10fc::3")).toEqual({ status: "ok" });
    expect(state.fetch.mock.calls[0][0]).toContain("https://ipwho.is/");
  });

  it("usa segundo provedor se o HTTPS falhar", async () => {
    state.geo = { country: "", city: "" };
    state.fetch.mockRejectedValueOnce(new Error("timeout"));
    state.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      status: "success", country: "Brazil", countryCode: "BR",
    }) });
    expect((await geolocate("2804:10fc::4")).isBrazil).toBe(true);
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it("não transforma falha de localização em estrangeiro nem mantém cache de erro", async () => {
    state.geo = null;
    state.fetch.mockRejectedValueOnce(new Error("timeout")).mockRejectedValueOnce(new Error("timeout"));
    expect(await geolocate("2804:10fc::5")).toMatchObject({ countryCode: "", isBrazil: false });
    state.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      success: true, country_code: "BR",
    }) });
    expect((await geolocate("2804:10fc::5")).isBrazil).toBe(true);
    expect(state.fetch).toHaveBeenCalledTimes(3);
  });

  it("origem desconhecida não recebe rótulo estrangeiro", async () => {
    state.geo = null;
    state.fetch.mockRejectedValue(new Error("timeout"));
    state.block = { attempts: 2, isBanned: false };
    expect(await handleFailedLogin("2001:db8::99")).toBe(true);
    expect(state.updated).toHaveBeenCalledWith(expect.objectContaining({ isForeign: false }));
  });

  it.each([
    [" [2804:10FC:060D:CD00:28BE:33BF:3AC8:B135] ", "2804:10fc:60d:cd00:28be:33bf:3ac8:b135"],
    ["[2804:10fc::1]:443", "2804:10fc::1"],
    ["::FFFF:200.160.2.3", "200.160.2.3"],
    ["[::ffff:c8a0:203]", "200.160.2.3"],
  ])("normaliza %s", (raw, expected) => {
    expect(normalizeIp(raw)).toBe(expected);
  });

  it("extrai primeiro IP da lista forwarded, também quando header é array", () => {
    expect(getClientIp({ headers: { "x-forwarded-for": ["2804:10FC::1, 127.0.0.1"] } }))
      .toBe("2804:10fc::1");
    expect(getClientIp({ ip: "::ffff:200.160.2.3", headers: {} })).toBe("200.160.2.3");
  });
});