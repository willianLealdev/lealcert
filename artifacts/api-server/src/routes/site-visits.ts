/**
 * Rastreamento de visitas ao site.
 *
 * Públicas:
 *   POST /api/track   — registra uma visita (fire-and-forget do frontend)
 *
 * Admin:
 *   GET /admin/site-visits/stats   — resumo (cards + top páginas)
 *   GET /admin/site-visits/recent  — lista paginada de visitas recentes
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// ─── Mapa de paths amigáveis ──────────────────────────────────────
const PAGE_LABELS: Record<string, string> = {
  "/": "Página Inicial",
  "/entrar": "Login",
  "/login": "Login",
  "/register": "Cadastro",
  "/comprar": "Comprar",
  "/dashboard": "Dashboard (cliente)",
  "/orders": "Meus Pedidos",
  "/support": "Suporte",
  "/fidelidade": "Fidelidade",
  "/forgot-password": "Esqueci a Senha",
  "/change-password": "Trocar Senha",
  "/verify-email": "Verificar E-mail",
  "/politica-de-privacidade": "Política de Privacidade",
};

function labelFor(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  if (path.startsWith("/orders/")) return "Detalhe do Pedido";
  if (path.startsWith("/admin")) return "Admin — " + path.replace("/admin/", "").replace("/admin", "Dashboard");
  if (path.startsWith("/vendedor")) return "Painel Vendedor";
  if (path.startsWith("/agente")) return "Painel Agente";
  return path;
}

function detectDevice(ua: string): "mobile" | "tablet" | "desktop" {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

// ─── GEO lookup via ip-api.com (gratuito, sem key, 45 req/min) ────
async function geoLookup(ip: string) {
  try {
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168") || ip.startsWith("10.")) {
      return { country: "Local", countryCode: "BR", region: null, city: null, isp: null };
    }
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const d = await res.json() as {
      status?: string;
      country?: string;
      countryCode?: string;
      regionName?: string;
      city?: string;
      isp?: string;
    };
    if (d.status !== "success") return null;
    return { country: d.country, countryCode: d.countryCode, region: d.regionName, city: d.city, isp: d.isp };
  } catch {
    return null;
  }
}

// ─── POST /track ──────────────────────────────────────────────────
router.post("/track", async (req, res) => {
  res.status(204).end(); // responde imediatamente

  try {
    const { path, referrer, sessionId } = req.body ?? {};
    if (!path) return;

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";

    const ua = req.headers["user-agent"] ?? "";
    const device = detectDevice(ua);
    const pageTitle = labelFor(path);
    const userId = (req as any).session?.userId ?? null;

    // Geo lookup em background (não bloqueia)
    const geo = await geoLookup(ip);

    await pool.query(
      `INSERT INTO site_visits (path, page_title, ip, country, country_code, region, city, isp, user_id, user_agent, device, referrer, session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        path, pageTitle, ip,
        geo?.country ?? null, geo?.countryCode ?? null,
        geo?.region ?? null, geo?.city ?? null, geo?.isp ?? null,
        userId, ua, device,
        referrer || null, sessionId || null,
      ],
    );
  } catch (err) {
    // fire-and-forget — não loga erro para o usuário
    console.error("[site-visits] track error:", err);
  }
});

// ─── GET /admin/site-visits/stats ────────────────────────────────
router.get("/admin/site-visits/stats", requireAdmin, async (req: any, res) => {
  try {
    const period = (req.query.period as string) || "7d";
    const days = period === "1d" ? 1 : period === "30d" ? 30 : 7;
    const countryFilter = (req.query.country as string) || null;

    // Cláusula de país (opcional)
    const countryClause = countryFilter ? ` AND country_code = $2` : "";
    const params = (extra: number[]) => countryFilter ? [days, countryFilter, ...extra] : [days, ...extra];
    const shift = countryFilter ? 3 : 2; // próximo $N disponível

    const [overview, topPages, byDevice, byCountry, byDay] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total_visits, COUNT(DISTINCT ip) AS unique_ips,
                COUNT(DISTINCT session_id) AS unique_sessions,
                COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) AS logged_users
         FROM site_visits WHERE created_at >= NOW() - ($1 || ' days')::interval${countryClause}`,
        params([]),
      ),
      pool.query(
        `SELECT path, page_title, COUNT(*) AS visits, COUNT(DISTINCT ip) AS uniques
         FROM site_visits WHERE created_at >= NOW() - ($1 || ' days')::interval${countryClause}
         GROUP BY path, page_title ORDER BY visits DESC LIMIT 15`,
        params([]),
      ),
      pool.query(
        `SELECT device, COUNT(*) AS visits FROM site_visits
         WHERE created_at >= NOW() - ($1 || ' days')::interval${countryClause}
         GROUP BY device ORDER BY visits DESC`,
        params([]),
      ),
      // byCountry sempre sem filtro de país (mostra todos para o seletor)
      pool.query(
        `SELECT country, country_code, COUNT(*) AS visits FROM site_visits
         WHERE created_at >= NOW() - ($1 || ' days')::interval AND country IS NOT NULL
         GROUP BY country, country_code ORDER BY visits DESC`,
        [days],
      ),
      pool.query(
        `SELECT DATE(created_at) AS day, COUNT(*) AS visits, COUNT(DISTINCT ip) AS uniques
         FROM site_visits WHERE created_at >= NOW() - ($1 || ' days')::interval${countryClause}
         GROUP BY day ORDER BY day`,
        params([]),
      ),
    ]);

    res.json({
      overview: overview.rows[0],
      topPages: topPages.rows,
      byDevice: byDevice.rows,
      byCountry: byCountry.rows,
      byDay: byDay.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/site-visits/recent ───────────────────────────────
router.get("/admin/site-visits/recent", requireAdmin, async (req: any, res) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = 50;
    const offset = (page - 1) * limit;
    const filterPath    = (req.query.path    as string) || null;
    const filterCountry = (req.query.country as string) || null;
    const period = (req.query.period as string) || "7d";
    const days = period === "1d" ? 1 : period === "30d" ? 30 : 7;

    // Monta cláusulas WHERE dinamicamente
    const whereParts = [`sv.created_at >= NOW() - ($1 || ' days')::interval`];
    const queryParams: (string | number)[] = [days];

    if (filterPath) {
      queryParams.push(filterPath);
      whereParts.push(`sv.path = $${queryParams.length}`);
    }
    if (filterCountry) {
      queryParams.push(filterCountry);
      whereParts.push(`sv.country_code = $${queryParams.length}`);
    }

    const whereClause = whereParts.join(" AND ");

    const limitParam  = queryParams.length + 1;
    const offsetParam = queryParams.length + 2;

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT sv.id, sv.path, sv.page_title, sv.ip, sv.country, sv.country_code, sv.city, sv.region, sv.isp,
                sv.device, sv.user_agent, sv.referrer, sv.session_id, sv.created_at,
                u.name AS user_name, u.email AS user_email
         FROM site_visits sv LEFT JOIN users u ON u.id = sv.user_id
         WHERE ${whereClause}
         ORDER BY sv.created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
        [...queryParams, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM site_visits sv WHERE ${whereClause}`,
        queryParams,
      ),
    ]);

    res.json({ visits: rows.rows, total: parseInt(countRow.rows[0]?.total || "0", 10), page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
