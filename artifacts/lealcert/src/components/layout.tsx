import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pedidos", href: "/orders", icon: ShoppingCart },
  { name: "Suporte", href: "/support", icon: LifeBuoy },
];

const adminNav = [
  { name: "Usuários", href: "/admin/users", icon: Users },
  { name: "Catálogo", href: "/admin/certificates", icon: FileBadge },
  { name: "Agenda", href: "/admin/slots", icon: CalendarDays },
  { name: "Marketing", href: "/admin/marketing", icon: Megaphone },
  { name: "Configurações", href: "/admin/settings", icon: Settings },
];

function NavItem({ href, icon: Icon, name, active }: { href: string; icon: React.ElementType; name: string; active: boolean }) {
  return (
    <Link href={href}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
          active
            ? "bg-primary text-white shadow-sm"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {name}
      </div>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar flex flex-col shrink-0 border-r border-sidebar-border shadow-xl">
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b border-sidebar-border/50 flex items-center justify-center">
          <img src="/logo.png" alt="LealCert" className="h-20 w-auto object-contain" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            Principal
          </p>
          {navigation.map((item) => (
            <NavItem
              key={item.name}
              href={item.href}
              icon={item.icon}
              name={item.name}
              active={location === item.href || location.startsWith(item.href + "/")}
            />
          ))}

          {user?.role === "admin" && (
            <>
              <p className="px-3 mt-6 mb-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Administração
              </p>
              {adminNav.map((item) => (
                <NavItem
                  key={item.name}
                  href={item.href}
                  icon={item.icon}
                  name={item.name}
                  active={location === item.href || location.startsWith(item.href + "/")}
                />
              ))}
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-sidebar-border/50 space-y-1">
          <Link href="/profile">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all">
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <UserIcon className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sidebar-foreground truncate text-xs">{user?.name}</p>
                <p className="text-xs text-sidebar-foreground/50 capitalize">
                  {user?.role === "admin" ? "Administrador" : "Contador"}
                </p>
              </div>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
