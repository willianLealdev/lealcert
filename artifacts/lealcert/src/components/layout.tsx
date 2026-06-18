import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FileBadge,
  ShoppingCart,
  Users,
  CalendarDays,
  Settings,
  LifeBuoy,
  LogOut,
  User as UserIcon,
  Megaphone,
  Menu,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Tag,
  Bell,
  BellOff,
  BellRing,
  Loader2,
} from "lucide-react";
import { usePush } from "@/lib/use-push";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pedidos", href: "/orders", icon: ShoppingCart },
  { name: "Suporte", href: "/support", icon: LifeBuoy },
];

const adminNav = [
  { name: "Usuários", href: "/admin/users", icon: Users },
  { name: "Catálogo", href: "/admin/certificates", icon: FileBadge },
  { name: "Agenda", href: "/admin/slots", icon: CalendarDays },
  { name: "Renovações", href: "/admin/renovacoes", icon: RefreshCw },
  { name: "Descontos", href: "/admin/coupons", icon: Tag },
  { name: "Marketing", href: "/admin/marketing", icon: Megaphone },
  { name: "Configurações", href: "/admin/settings", icon: Settings },
];

function NavItem({
  href, icon: Icon, name, active, collapsed, onClick,
}: {
  href: string;
  icon: React.ElementType;
  name: string;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href}>
      <div
        onClick={onClick}
        title={collapsed ? name : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer select-none
          ${active
            ? "bg-primary text-white shadow-sm"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          }
          ${collapsed ? "justify-center px-0" : ""}
        `}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{name}</span>}
      </div>
    </Link>
  );
}

function PushBellButton({ collapsed }: { collapsed: boolean }) {
  const push = usePush();

  if (!push.supported) return null;

  let icon: React.ReactNode;
  let title: string;
  let cls = "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent";

  if (push.loading) {
    icon = <Loader2 className="h-4 w-4 animate-spin" />;
    title = "Processando...";
  } else if (push.permission === "denied") {
    icon = <BellOff className="h-4 w-4" />;
    title = "Notificações bloqueadas pelo navegador";
    cls = "text-sidebar-foreground/30 cursor-not-allowed";
  } else if (push.subscribed) {
    icon = <BellRing className="h-4 w-4 text-emerald-400" />;
    title = "Notificações ativas — clique para desativar";
    cls = "text-emerald-400 hover:text-emerald-300 hover:bg-sidebar-accent";
  } else {
    icon = <Bell className="h-4 w-4" />;
    title = "Ativar notificações push";
  }

  return (
    <button
      type="button"
      title={title}
      disabled={push.loading || push.permission === "denied"}
      onClick={() => push.subscribed ? push.unsubscribe() : push.subscribe()}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all select-none ${cls} ${collapsed ? "justify-center px-0" : ""}`}
    >
      {icon}
      {!collapsed && (
        <span className="truncate text-xs">
          {push.subscribed ? "Notificações ativas" : "Ativar notificações"}
        </span>
      )}
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const [location] = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const close = () => setMobileOpen(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border shadow-2xl
          transition-[transform,width] duration-300 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:z-auto md:shrink-0
          ${collapsed ? "md:w-16" : "md:w-64"}
          w-72
        `}
      >
        {/* Brand + collapse button */}
        <div className={`px-3 pt-5 pb-4 border-b border-sidebar-border/50 flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
          {!collapsed ? (
            <>
              <img src={branding.logoUrl ?? "/logo.png"} alt={branding.appName} className="h-16 w-auto object-contain" />
              <button
                onClick={() => setCollapsed(true)}
                className="hidden md:flex p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shrink-0"
                title="Recolher menu"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setCollapsed(false)}
              className="hidden md:flex p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title="Expandir menu"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          {/* Mobile: show logo always */}
          {collapsed && (
            <img src={branding.logoUrl ?? "/logo.png"} alt={branding.appName} className="h-8 w-8 object-contain md:hidden" />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {!collapsed && (
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Principal
            </p>
          )}
          {collapsed && <div className="mb-2" />}

          {navigation.map((item) => (
            <NavItem
              key={item.name}
              href={item.href}
              icon={item.icon}
              name={item.name}
              active={location === item.href || location.startsWith(item.href + "/")}
              collapsed={collapsed}
              onClick={close}
            />
          ))}

          {user?.role === "admin" && (
            <>
              {!collapsed ? (
                <p className="px-3 pt-5 pb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                  Administração
                </p>
              ) : (
                <div className="my-3 border-t border-sidebar-border/30" />
              )}
              {adminNav.map((item) => (
                <NavItem
                  key={item.name}
                  href={item.href}
                  icon={item.icon}
                  name={item.name}
                  active={location === item.href || location.startsWith(item.href + "/")}
                  collapsed={collapsed}
                  onClick={close}
                />
              ))}
            </>
          )}
        </nav>

        {/* Safeweb certifier badge */}
        {!collapsed && (
          <div className="px-3 py-2 border-t border-sidebar-border/30">
            <div className="flex items-center gap-2">
              <span className="text-sidebar-foreground/30 text-[10px] uppercase tracking-wider whitespace-nowrap">Certificado por</span>
              <img
                src="/safeweb-logo.png"
                alt="Safeweb"
                className="h-5 w-auto object-contain brightness-0 invert opacity-40"
              />
            </div>
          </div>
        )}

        {/* User footer */}
        <div className="p-2 border-t border-sidebar-border/50 space-y-0.5">
          <PushBellButton collapsed={collapsed} />
          <Link href="/profile">
            <div
              onClick={close}
              title={collapsed ? user?.name ?? "Perfil" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all select-none ${collapsed ? "justify-center px-0" : ""}`}
            >
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <UserIcon className="h-3.5 w-3.5 text-primary" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="font-medium text-sidebar-foreground truncate text-xs">{user?.name}</p>
                  <p className="text-xs text-sidebar-foreground/50 capitalize">
                    {user?.role === "admin" ? "Administrador" : "Contador"}
                  </p>
                </div>
              )}
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            title={collapsed ? "Sair" : undefined}
            className={`w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent ${collapsed ? "justify-center px-0" : "justify-start gap-3"}`}
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sair"}
          </Button>
        </div>
      </aside>

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-sidebar-border sticky top-0 z-30 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src={branding.logoUrl ?? "/logo.png"} alt={branding.appName} className="h-9 w-auto object-contain" />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-8 max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
