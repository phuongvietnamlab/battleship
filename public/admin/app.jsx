import React from "react";
import * as ReactDOM from "react-dom/client";
import { io } from "socket.io-client";
const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;

// ═══════════════════════════════════════════════════════════════════════════════
// i18n
// ═══════════════════════════════════════════════════════════════════════════════
const I18N = {
  en: {
    "nav.dashboard": "Dashboard", "nav.users": "Users", "nav.matches": "Matches",
    "nav.content": "Content", "nav.moderation": "Moderation", "nav.operations": "Operations",
    "nav.audit": "Audit Log", "nav.emojis": "Emojis", "nav.announcements": "Announcements",
    "nav.powerups": "Power-ups", "nav.reports": "Reports", "nav.chat": "Chat Logs",
    "nav.suspicious": "Suspicious", "nav.health": "Health", "nav.config": "Config",
    "nav.backup": "Backup", "nav.maintenance": "Maintenance",
    "login.title": "Battleship Admin", "login.email": "Email", "login.password": "Password",
    "login.submit": "Sign In", "login.error.auth": "Invalid credentials",
    "login.error.notAdmin": "No admin access", "login.error.rate": "Too many attempts, try later",
    "common.save": "Save Changes", "common.cancel": "Cancel", "common.delete": "Delete",
    "common.export": "Export CSV", "common.search": "Search...", "common.loading": "Loading...",
    "common.noData": "No data", "common.confirm": "Confirm", "common.showing": "Showing",
    "common.of": "of", "common.logout": "Logout", "common.online": "Online",
    "toast.success": "Success", "toast.error": "Error",
    "dashboard.totalUsers": "Total Users", "dashboard.dau": "Active Today",
    "dashboard.matchesToday": "Matches Today", "dashboard.pointsSpent": "Points Spent",
    "dashboard.onlineNow": "Online Now", "dashboard.newUsers": "New Users",
    "dashboard.activeMatches": "Active Matches",
  },
  vi: {
    "nav.dashboard": "Bảng điều khiển", "nav.users": "Người dùng", "nav.matches": "Trận đấu",
    "nav.content": "Nội dung", "nav.moderation": "Kiểm duyệt", "nav.operations": "Vận hành",
    "nav.audit": "Nhật ký", "nav.emojis": "Biểu tượng", "nav.announcements": "Thông báo",
    "nav.powerups": "Vật phẩm", "nav.reports": "Báo cáo", "nav.chat": "Nhật ký chat",
    "nav.suspicious": "Nghi vấn", "nav.health": "Hệ thống", "nav.config": "Cấu hình",
    "nav.backup": "Sao lưu", "nav.maintenance": "Bảo trì",
    "login.title": "Battleship Admin", "login.email": "Email", "login.password": "Mật khẩu",
    "login.submit": "Đăng nhập", "login.error.auth": "Sai thông tin đăng nhập",
    "login.error.notAdmin": "Không có quyền admin", "login.error.rate": "Quá nhiều lần thử",
    "common.save": "Lưu", "common.cancel": "Hủy", "common.delete": "Xóa",
    "common.export": "Xuất CSV", "common.search": "Tìm kiếm...", "common.loading": "Đang tải...",
    "common.noData": "Không có dữ liệu", "common.confirm": "Xác nhận", "common.showing": "Hiển thị",
    "common.of": "của", "common.logout": "Đăng xuất", "common.online": "Trực tuyến",
    "toast.success": "Thành công", "toast.error": "Lỗi",
    "dashboard.totalUsers": "Tổng người dùng", "dashboard.dau": "Hoạt động hôm nay",
    "dashboard.matchesToday": "Trận hôm nay", "dashboard.pointsSpent": "Điểm đã tiêu",
    "dashboard.onlineNow": "Đang online", "dashboard.newUsers": "Người dùng mới",
    "dashboard.activeMatches": "Trận đang diễn ra",
  },
};

function useI18n() {
  const [lang, setLang] = useState(() => localStorage.getItem("admin-lang") || "en");
  const t = (key) => (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  const changeLang = (l) => { setLang(l); localStorage.setItem("admin-lang", l); };
  return { t, lang, setLang: changeLang };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Theme
// ═══════════════════════════════════════════════════════════════════════════════
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("admin-theme") || "dark");
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("admin-theme", theme); }, [theme]);
  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  return { theme, toggle };
}

// ═══════════════════════════════════════════════════════════════════════════════
// API hook
// ═══════════════════════════════════════════════════════════════════════════════
function useApi() {
  const base = "/api/admin";
  async function request(method, path, body) {
    const opts = { method, credentials: "include", headers: {} };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(base + path, opts);
    if (res.status === 401) { window.location.hash = "#/login"; throw new Error("UNAUTHORIZED"); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "REQUEST_FAILED");
    return data;
  }
  return {
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b),
    put: (p, b) => request("PUT", p, b),
    del: (p) => request("DELETE", p),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Toast
// ═══════════════════════════════════════════════════════════════════════════════
const ToastContext = createContext();
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const show = (message, type = "success", duration = 5000) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    if (type !== "error") setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  };
  const dismiss = (id) => setToasts(t => t.filter(x => x.id !== id));
  return React.createElement(ToastContext.Provider, { value: { show } },
    children,
    React.createElement("div", { className: "toast-container" },
      toasts.map(t => React.createElement("div", { key: t.id, className: `toast toast-${t.type}` },
        React.createElement("span", null, t.message),
        React.createElement("button", { className: "toast-close", onClick: () => dismiss(t.id) }, "×")
      ))
    )
  );
}
function useToast() { return useContext(ToastContext); }

// ═══════════════════════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════════════════════
function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || "/dashboard");
  useEffect(() => {
    const handler = () => setRoute(window.location.hash.slice(1) || "/dashboard");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return route;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════════════════════════════════════════════
function Sidebar({ route, adminUser, collapsed, onToggle }) {
  const { t } = useI18n();
  const [expandedSections, setExpanded] = useState({ content: false, moderation: false, operations: false });
  const toggleSection = (s) => setExpanded(p => ({ ...p, [s]: !p[s] }));

  const navItem = (icon, label, path, indent) => {
    const active = route === path || route.startsWith(path + "/");
    return React.createElement("a", {
      href: "#" + path, className: `nav-item ${active ? "active" : ""} ${indent ? "nav-sub" : ""}`,
      title: collapsed ? label : undefined
    }, React.createElement("span", { className: "nav-icon" }, icon),
       !collapsed && React.createElement("span", { className: "nav-label" }, label));
  };

  const section = (icon, label, key, children) => {
    const isOpen = expandedSections[key];
    const hasActive = children.some(c => route.startsWith(c.path));
    return React.createElement("div", { className: "nav-section" },
      React.createElement("div", {
        className: `nav-item nav-expandable ${hasActive ? "active" : ""}`,
        onClick: () => toggleSection(key)
      },
        React.createElement("span", { className: "nav-icon" }, icon),
        !collapsed && React.createElement("span", { className: "nav-label" }, label),
        !collapsed && React.createElement("span", { className: `nav-chevron ${isOpen ? "open" : ""}` }, "›")
      ),
      !collapsed && isOpen && React.createElement("div", { className: "nav-children" },
        children.map(c => navItem("", c.label, c.path, true))
      )
    );
  };

  return React.createElement("aside", { className: `sidebar ${collapsed ? "collapsed" : ""}` },
    React.createElement("div", { className: "sidebar-header" },
      React.createElement("span", { className: "sidebar-logo" }, collapsed ? "⚓" : "⚓ Battleship Admin"),
      React.createElement("button", { className: "sidebar-toggle", onClick: onToggle }, collapsed ? "»" : "«")
    ),
    React.createElement("nav", { className: "sidebar-nav", "aria-label": "Admin navigation" },
      navItem("📊", t("nav.dashboard"), "/dashboard"),
      React.createElement("div", { className: "nav-divider" }),
      navItem("👥", t("nav.users"), "/users"),
      navItem("⚔️", t("nav.matches"), "/matches"),
      React.createElement("div", { className: "nav-divider" }),
      section("📝", t("nav.content"), "content", [
        { label: t("nav.emojis"), path: "/content/emojis" },
        { label: t("nav.announcements"), path: "/content/announcements" },
        { label: t("nav.powerups"), path: "/content/powerups" },
      ]),
      section("🛡️", t("nav.moderation"), "moderation", [
        { label: t("nav.reports"), path: "/moderation/reports" },
        { label: t("nav.chat"), path: "/moderation/chat" },
        { label: t("nav.suspicious"), path: "/moderation/suspicious" },
      ]),
      section("⚙️", t("nav.operations"), "operations", [
        { label: t("nav.health"), path: "/operations/health" },
        { label: t("nav.config"), path: "/operations/config" },
        { label: t("nav.backup"), path: "/operations/backup" },
        { label: t("nav.maintenance"), path: "/operations/maintenance" },
      ]),
      React.createElement("div", { className: "nav-divider" }),
      navItem("📋", t("nav.audit"), "/audit"),
    ),
    React.createElement("div", { className: "sidebar-footer" },
      adminUser && React.createElement("div", { className: "sidebar-user" },
        React.createElement("span", { className: `badge badge-${adminUser.role === "super_admin" ? "accent" : "neutral"}` }, adminUser.role),
        !collapsed && React.createElement("span", { className: "sidebar-username" }, adminUser.display_name)
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Login Page
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const api = useApi();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await api.post("/login", { email, password });
      onLogin(data.user);
      window.location.hash = "#/dashboard";
    } catch (err) {
      if (err.message === "AUTH_FAILED") setError(t("login.error.auth"));
      else if (err.message === "NOT_ADMIN") setError(t("login.error.notAdmin"));
      else if (err.message === "RATE_LIMITED") setError(t("login.error.rate"));
      else setError(err.message);
    } finally { setLoading(false); }
  };

  return React.createElement("div", { className: "login-page" },
    React.createElement("form", { className: "login-card", onSubmit: handleSubmit, "aria-label": "Admin login" },
      React.createElement("h1", { className: "login-title" }, "⚓ " + t("login.title")),
      error && React.createElement("div", { className: "login-error", role: "alert" }, error),
      React.createElement("label", { className: "form-label" }, t("login.email"),
        React.createElement("input", { type: "email", className: "form-input", value: email, onChange: e => setEmail(e.target.value), required: true, autoComplete: "email" })
      ),
      React.createElement("label", { className: "form-label" }, t("login.password"),
        React.createElement("input", { type: "password", className: "form-input", value: password, onChange: e => setPassword(e.target.value), required: true, autoComplete: "current-password" })
      ),
      React.createElement("button", { type: "submit", className: "btn btn-primary btn-full", disabled: loading },
        loading ? "..." : t("login.submit")
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Page (simplified for scaffold)
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardPage() {
  const [overview, setOverview] = useState(null);
  const api = useApi();
  const { t } = useI18n();

  useEffect(() => { api.get("/analytics/overview").then(setOverview).catch(() => {}); }, []);

  const Card = ({ label, value, live }) => React.createElement("div", { className: "metric-card" },
    React.createElement("div", { className: "metric-label" }, label, live && React.createElement("span", { className: "live-dot" })),
    React.createElement("div", { className: "metric-value" }, value != null ? value.toLocaleString() : "—")
  );

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, t("nav.dashboard")),
    React.createElement("div", { className: "metric-grid" },
      React.createElement(Card, { label: t("dashboard.onlineNow"), value: overview?.onlineNow, live: true }),
      React.createElement(Card, { label: t("dashboard.activeMatches"), value: overview?.activeMatches, live: true }),
      React.createElement(Card, { label: t("dashboard.matchesToday"), value: overview?.matchesToday }),
      React.createElement(Card, { label: t("dashboard.newUsers"), value: overview?.newUsersToday }),
      React.createElement(Card, { label: t("dashboard.pointsSpent"), value: overview?.pointsSpentToday }),
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Placeholder pages (to be expanded in Plan 08)
// ═══════════════════════════════════════════════════════════════════════════════
function PlaceholderPage({ title }) {
  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, title),
    React.createElement("p", { className: "text-secondary" }, "Coming soon...")
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// App
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const route = useHashRoute();
  const { theme, toggle: toggleTheme } = useTheme();
  const { t, lang, setLang } = useI18n();
  const [adminUser, setAdminUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("admin-sidebar") === "collapsed");
  const api = useApi();

  useEffect(() => {
    api.get("/me").then(data => { setAdminUser(data); setAuthChecked(true); })
      .catch(() => { setAuthChecked(true); window.location.hash = "#/login"; });
  }, []);

  const handleCollapse = () => {
    setSidebarCollapsed(c => { const n = !c; localStorage.setItem("admin-sidebar", n ? "collapsed" : "expanded"); return n; });
  };

  const handleLogout = async () => {
    await api.post("/logout", {});
    setAdminUser(null);
    window.location.hash = "#/login";
  };

  if (!authChecked) return React.createElement("div", { className: "loading-page" }, t("common.loading"));
  if (route === "/login" || !adminUser) return React.createElement(LoginPage, { onLogin: setAdminUser });

  const pageMap = {
    "/dashboard": () => React.createElement(DashboardPage),
    "/users": () => React.createElement(PlaceholderPage, { title: t("nav.users") }),
    "/matches": () => React.createElement(PlaceholderPage, { title: t("nav.matches") }),
    "/content/emojis": () => React.createElement(PlaceholderPage, { title: t("nav.emojis") }),
    "/content/announcements": () => React.createElement(PlaceholderPage, { title: t("nav.announcements") }),
    "/content/powerups": () => React.createElement(PlaceholderPage, { title: t("nav.powerups") }),
    "/moderation/reports": () => React.createElement(PlaceholderPage, { title: t("nav.reports") }),
    "/moderation/chat": () => React.createElement(PlaceholderPage, { title: t("nav.chat") }),
    "/moderation/suspicious": () => React.createElement(PlaceholderPage, { title: t("nav.suspicious") }),
    "/operations/health": () => React.createElement(PlaceholderPage, { title: t("nav.health") }),
    "/operations/config": () => React.createElement(PlaceholderPage, { title: t("nav.config") }),
    "/operations/backup": () => React.createElement(PlaceholderPage, { title: t("nav.backup") }),
    "/operations/maintenance": () => React.createElement(PlaceholderPage, { title: t("nav.maintenance") }),
    "/audit": () => React.createElement(PlaceholderPage, { title: t("nav.audit") }),
  };

  const renderPage = pageMap[route] || pageMap["/dashboard"];

  return React.createElement("div", { className: "admin-layout" },
    React.createElement(Sidebar, { route, adminUser, collapsed: sidebarCollapsed, onToggle: handleCollapse }),
    React.createElement("main", { className: "admin-content", id: "main-content" },
      React.createElement("header", { className: "admin-topbar" },
        React.createElement("div"),
        React.createElement("div", { className: "topbar-actions" },
          React.createElement("button", { className: "btn btn-ghost", onClick: () => setLang(lang === "en" ? "vi" : "en") }, lang === "en" ? "VI" : "EN"),
          React.createElement("button", { className: "btn btn-ghost", onClick: toggleTheme, "aria-label": "Toggle theme", "aria-pressed": theme === "dark" }, theme === "dark" ? "☀️" : "🌙"),
          React.createElement("button", { className: "btn btn-ghost", onClick: handleLogout }, t("common.logout"))
        )
      ),
      renderPage()
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mount
// ═══════════════════════════════════════════════════════════════════════════════
ReactDOM.createRoot(document.getElementById("admin-root")).render(
  React.createElement(ToastProvider, null, React.createElement(App))
);
