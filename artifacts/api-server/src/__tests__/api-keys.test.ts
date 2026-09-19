import { describe, expect, it } from "vitest";
import {
  extractTokenPrefix, generateApiToken, hashApiToken, levelAllowsMethod,
  safelyMatchesHash, scopeForPath, telephonyCapabilityForRequest,
} from "../lib/api-keys";

describe("API keys", () => {
  it("gera token forte e armazena somente hash verificável", () => {
    const generated = generateApiToken();
    expect(generated.token).toMatch(/^lc_live_[a-f0-9]{12}\.[A-Za-z0-9_-]{40,}$/);
    expect(generated.hash).toBe(hashApiToken(generated.token));
    expect(generated.hash).not.toContain(generated.token);
    expect(extractTokenPrefix(generated.token)).toBe(generated.prefix);
    expect(safelyMatchesHash(generated.token, generated.hash)).toBe(true);
    expect(safelyMatchesHash(`${generated.token}x`, generated.hash)).toBe(false);
  });

  it("aplica os métodos permitidos por nível", () => {
    expect(levelAllowsMethod("read", "GET")).toBe(true);
    expect(levelAllowsMethod("read", "POST")).toBe(false);
    expect(levelAllowsMethod("write", "PATCH")).toBe(true);
    expect(levelAllowsMethod("write", "DELETE")).toBe(false);
    expect(levelAllowsMethod("full", "DELETE")).toBe(true);
  });

  it("mapeia somente caminhos dos módulos externos autorizados", () => {
    expect(scopeForPath("/users")).toBe("users");
    expect(scopeForPath("/marketing/contacts")).toBe("marketing");
    expect(scopeForPath("/marketing/wa/campaigns")).toBe("whatsapp");
    expect(scopeForPath("/admin/discagem/campaigns")).toBe("discagem");
    expect(scopeForPath("/admin/relatorio/resumo")).toBe("finance");
    expect(scopeForPath("/auth/login")).toBeNull();
  });

  it("exige permissão específica para leitura e comando de telefonia", () => {
    expect(telephonyCapabilityForRequest("/telephony/calls", "GET")).toBe("analyze");
    expect(telephonyCapabilityForRequest("/telephony/calls/start", "POST")).toBe("command");
    expect(telephonyCapabilityForRequest("/admin/discagem/campaigns/1/pause", "POST")).toBe("command");
    expect(telephonyCapabilityForRequest("/orders", "GET")).toBeNull();
  });
});