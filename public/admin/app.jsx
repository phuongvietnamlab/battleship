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
// Dashboard Page
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardPage() {
  const [overview, setOverview] = useState(null);
  const [userChart, setUserChart] = useState([]);
  const [matchChart, setMatchChart] = useState([]);
  const [pointsChart, setPointsChart] = useState([]);
  const [range, setRange] = useState("30");
  const api = useApi();
  const { t } = useI18n();

  useEffect(() => { api.get("/analytics/overview").then(setOverview).catch(() => {}); }, []);
  useEffect(() => {
    api.get(`/analytics/users?range=${range}`).then(d => setUserChart(d.data || [])).catch(() => {});
    api.get(`/analytics/matches?range=${range}`).then(d => setMatchChart(d.data || [])).catch(() => {});
    api.get(`/analytics/points?range=${range}`).then(d => setPointsChart(d.data || [])).catch(() => {});
  }, [range]);

  const Card = ({ label, value, live }) => React.createElement("div", { className: "metric-card" },
    React.createElement("div", { className: "metric-label" }, label, live && React.createElement("span", { className: "live-dot" })),
    React.createElement("div", { className: "metric-value" }, value != null ? value.toLocaleString() : "—")
  );

  const SimpleChart = ({ title, data, lines, type }) => {
    if (!data || data.length === 0) return React.createElement("div", { className: "chart-card chart-empty" },
      React.createElement("div", { className: "chart-title" }, title),
      React.createElement("div", { className: "chart-no-data" }, "No data for this period")
    );
    const maxVal = Math.max(...data.flatMap(d => lines.map(l => Number(d[l.key]) || 0)), 1);
    const w = 100 / data.length;
    return React.createElement("div", { className: "chart-card" },
      React.createElement("div", { className: "chart-title" }, title),
      React.createElement("div", { className: "chart-area" },
        type === "bar" ? React.createElement("div", { className: "chart-bars" },
          data.map((d, i) => React.createElement("div", { key: i, className: "chart-bar-group", style: { width: w + "%" } },
            lines.map(l => React.createElement("div", { key: l.key, className: "chart-bar", title: `${l.name}: ${d[l.key] || 0}`, style: { height: Math.max(2, ((Number(d[l.key]) || 0) / maxVal) * 100) + "%", background: l.color } })),
            React.createElement("div", { className: "chart-bar-label" }, data.length <= 15 ? (d.date || "").slice(5) : "")
          ))
        ) : React.createElement("svg", { className: "chart-svg", viewBox: `0 0 ${data.length * 10} 100`, preserveAspectRatio: "none" },
          lines.map(l => {
            const points = data.map((d, i) => `${i * 10},${100 - ((Number(d[l.key]) || 0) / maxVal) * 95}`).join(" ");
            return React.createElement("polyline", { key: l.key, points, fill: "none", stroke: l.color, strokeWidth: "2", vectorEffect: "non-scaling-stroke" });
          })
        ),
        React.createElement("div", { className: "chart-legend" },
          lines.map(l => React.createElement("span", { key: l.key, className: "legend-item" },
            React.createElement("span", { className: "legend-dot", style: { background: l.color } }),
            l.name
          ))
        )
      )
    );
  };

  return React.createElement("div", { className: "page" },
    React.createElement("div", { className: "page-header" },
      React.createElement("h1", { className: "page-title" }, t("nav.dashboard")),
      React.createElement("select", { className: "form-input filter-select", value: range, onChange: e => setRange(e.target.value) },
        React.createElement("option", { value: "30" }, "30 days"),
        React.createElement("option", { value: "90" }, "90 days"),
        React.createElement("option", { value: "365" }, "1 year"),
      )
    ),
    React.createElement("div", { className: "metric-grid" },
      React.createElement(Card, { label: t("dashboard.onlineNow"), value: overview?.onlineNow, live: true }),
      React.createElement(Card, { label: t("dashboard.activeMatches"), value: overview?.activeMatches, live: true }),
      React.createElement(Card, { label: t("dashboard.matchesToday"), value: overview?.matchesToday }),
      React.createElement(Card, { label: t("dashboard.newUsers"), value: overview?.newUsersToday }),
      React.createElement(Card, { label: t("dashboard.pointsSpent"), value: overview?.pointsSpentToday }),
    ),
    React.createElement("div", { className: "charts-grid" },
      React.createElement(SimpleChart, { title: "User Growth (new users/day)", data: userChart, type: "line", lines: [{ key: "new_users", name: "New Users", color: "#667eea" }] }),
      React.createElement(SimpleChart, { title: "Match Activity", data: matchChart, type: "bar", lines: [{ key: "matches_classic", name: "Classic", color: "#68d391" }, { key: "matches_wagered", name: "Wagered", color: "#9f7aea" }] }),
    ),
    React.createElement("div", { className: "charts-grid charts-full" },
      React.createElement(SimpleChart, { title: "Points Economy", data: pointsChart, type: "line", lines: [{ key: "points_earned", name: "Earned", color: "#667eea" }, { key: "points_spent", name: "Spent", color: "#f6ad55" }] }),
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DataTable Component
// ═══════════════════════════════════════════════════════════════════════════════
function DataTable({ columns, data, total, page, limit, onPageChange, loading, emptyMessage, onRowClick }) {
  const totalPages = Math.ceil((total || 0) / (limit || 25));
  if (loading) return React.createElement("div", { className: "table-loading" }, "Loading...");
  if (!data || data.length === 0) return React.createElement("div", { className: "table-empty" }, emptyMessage || "No data");

  return React.createElement("div", { className: "table-container" },
    React.createElement("table", { className: "data-table" },
      React.createElement("thead", null,
        React.createElement("tr", null, columns.map(col =>
          React.createElement("th", { key: col.key }, col.label)
        ))
      ),
      React.createElement("tbody", null, data.map((row, i) =>
        React.createElement("tr", { key: row.id || i, onClick: onRowClick ? () => onRowClick(row) : undefined, className: onRowClick ? "clickable" : "" },
          columns.map(col => React.createElement("td", { key: col.key },
            col.render ? col.render(row[col.key], row) : (row[col.key] != null ? String(row[col.key]) : "—")
          ))
        )
      ))
    ),
    total > limit && React.createElement("div", { className: "table-pagination" },
      React.createElement("span", { className: "pagination-info" }, `Showing ${(page-1)*limit+1}-${Math.min(page*limit, total)} of ${total}`),
      React.createElement("div", { className: "pagination-btns" },
        React.createElement("button", { className: "btn btn-ghost", disabled: page <= 1, onClick: () => onPageChange(page-1) }, "←"),
        React.createElement("span", { className: "pagination-page" }, `${page}/${totalPages}`),
        React.createElement("button", { className: "btn btn-ghost", disabled: page >= totalPages, onClick: () => onPageChange(page+1) }, "→")
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Users Page
// ═══════════════════════════════════════════════════════════════════════════════
function UsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const api = useApi();
  const toast = useToast();
  const { t } = useI18n();
  const searchTimer = useRef(null);

  const fetchUsers = async (p, s, st) => {
    setLoading(true);
    try {
      const params = `?page=${p}&limit=25${s ? "&search=" + encodeURIComponent(s) : ""}${st !== "all" ? "&status=" + st : ""}`;
      const data = await api.get("/users" + params);
      setUsers(data.users); setTotal(data.total);
    } catch (e) {} finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(page, search, status); }, [page, status]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchUsers(1, val, status); }, 300);
  };

  const handleBan = async (userId, reason) => {
    try { await api.post(`/users/${userId}/ban`, { reason, duration: "7 days" }); toast.show("User banned"); fetchUsers(page, search, status); }
    catch (e) { toast.show("Ban failed: " + e.message, "error"); }
  };

  const handlePoints = async (userId, amount, reason) => {
    try { await api.post(`/users/${userId}/points`, { amount, reason }); toast.show(`Coin adjusted: ${amount > 0 ? "+" : ""}${amount}`); fetchUsers(page, search, status); }
    catch (e) { toast.show("Coin failed: " + e.message, "error"); }
  };

  const handleExport = () => { window.open(`/api/admin/users/export?search=${encodeURIComponent(search)}&status=${status}`, "_blank"); };

  const columns = [
    { key: "id", label: "ID" },
    { key: "display_name", label: "Name", render: (v) => v || "[no name]" },
    { key: "email", label: "Email", render: (v) => v || "—" },
    { key: "coin", label: "Coin", render: (v) => v != null ? v.toLocaleString() : "0" },
    { key: "created_at", label: "Joined", render: (v) => v ? new Date(v).toLocaleDateString() : "—" },
    { key: "ban_type", label: "Status", render: (v, row) => {
      if (row.deleted_at) return React.createElement("span", { className: "badge badge-neutral" }, "deleted");
      if (v === "ban") return React.createElement("span", { className: "badge badge-error" }, "banned");
      if (v === "mute") return React.createElement("span", { className: "badge badge-warning" }, "muted");
      return React.createElement("span", { className: "badge badge-success" }, "active");
    }},
    { key: "actions", label: "", render: (_, row) => React.createElement("div", { className: "row-actions" },
      React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: (e) => { e.stopPropagation(); const amt = prompt("Coin (+/-):"); const reason = prompt("Reason:"); if (amt && reason) handlePoints(row.id, parseInt(amt), reason); } }, "+Coin"),
      !row.ban_type && React.createElement("button", { className: "btn btn-ghost btn-sm btn-error-text", onClick: (e) => { e.stopPropagation(); const r = prompt("Reason for ban:"); if (r) handleBan(row.id, r); } }, "Ban")
    )},
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("div", { className: "page-header" },
      React.createElement("h1", { className: "page-title" }, t("nav.users")),
      React.createElement("button", { className: "btn btn-secondary", onClick: handleExport }, t("common.export"))
    ),
    React.createElement("div", { className: "table-toolbar" },
      React.createElement("input", { className: "form-input search-input", placeholder: t("common.search"), value: search, onChange: e => handleSearch(e.target.value) }),
      React.createElement("select", { className: "form-input filter-select", value: status, onChange: e => { setStatus(e.target.value); setPage(1); } },
        React.createElement("option", { value: "all" }, "All"),
        React.createElement("option", { value: "active" }, "Active"),
        React.createElement("option", { value: "banned" }, "Banned"),
        React.createElement("option", { value: "deleted" }, "Deleted"),
      )
    ),
    React.createElement(DataTable, { columns, data: users, total, page, limit: 25, onPageChange: setPage, loading, onRowClick: (row) => setSelected(row.id) }),
    selected && React.createElement(UserDetail, { userId: selected, onClose: () => setSelected(null), onAction: () => fetchUsers(page, search, status) })
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// User Detail Panel
// ═══════════════════════════════════════════════════════════════════════════════
function UserDetail({ userId, onClose, onAction }) {
  const [user, setUser] = useState(null);
  const api = useApi();
  const toast = useToast();

  useEffect(() => { api.get(`/users/${userId}`).then(setUser).catch(() => {}); }, [userId]);

  if (!user) return React.createElement("div", { className: "detail-panel" }, "Loading...");

  const handleUnban = async () => { await api.post(`/users/${userId}/unban`, {}); toast.show("User unbanned"); onAction(); onClose(); };
  const handlePoints = async () => {
    const amt = prompt("Amount (+/-):");
    const reason = prompt("Reason:");
    if (amt && reason) { try { await api.post(`/users/${userId}/points`, { amount: parseInt(amt), reason }); toast.show("Points adjusted"); onAction(); } catch(e) { toast.show(e.message, "error"); }}
  };

  return React.createElement("div", { className: "detail-overlay", onClick: onClose },
    React.createElement("div", { className: "detail-panel", onClick: e => e.stopPropagation() },
      React.createElement("div", { className: "detail-header" },
        React.createElement("h2", null, user.display_name || "User #" + user.id),
        React.createElement("button", { className: "btn btn-ghost", onClick: onClose }, "×")
      ),
      React.createElement("div", { className: "detail-body" },
        React.createElement("div", { className: "detail-row" }, React.createElement("span", null, "Email:"), React.createElement("span", null, user.email || "—")),
        React.createElement("div", { className: "detail-row" }, React.createElement("span", null, "Balance:"), React.createElement("span", null, user.wallet?.balance ?? "N/A")),
        React.createElement("div", { className: "detail-row" }, React.createElement("span", null, "Matches:"), React.createElement("span", null, `${user.matchStats?.wins || 0}W / ${user.matchStats?.losses || 0}L`)),
        React.createElement("div", { className: "detail-row" }, React.createElement("span", null, "Joined:"), React.createElement("span", null, new Date(user.created_at).toLocaleDateString())),
        React.createElement("div", { className: "detail-row" }, React.createElement("span", null, "Auth:"), React.createElement("span", null, user.authMethods?.map(m => m.type).join(", "))),
        user.banHistory?.length > 0 && React.createElement("div", { className: "detail-section" },
          React.createElement("h3", null, "Ban History"),
          user.banHistory.map(b => React.createElement("div", { key: b.id, className: "detail-row" },
            React.createElement("span", { className: `badge badge-${b.active ? "error" : "neutral"}` }, b.type),
            React.createElement("span", null, b.reason)
          ))
        )
      ),
      React.createElement("div", { className: "detail-footer" },
        React.createElement("button", { className: "btn btn-secondary", onClick: handlePoints }, "Adjust Points"),
        React.createElement("button", { className: "btn btn-secondary", onClick: handleUnban }, "Unban"),
      )
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Matches Page
// ═══════════════════════════════════════════════════════════════════════════════
function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const api = useApi();
  const { t } = useI18n();

  const fetchMatches = async (p) => {
    setLoading(true);
    try { const data = await api.get(`/matches?page=${p}&limit=25`); setMatches(data.matches); setTotal(data.total); }
    catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { fetchMatches(page); }, [page]);

  const columns = [
    { key: "id", label: "ID" },
    { key: "winner_name", label: "Winner", render: v => v || "—" },
    { key: "loser_name", label: "Loser", render: v => v || "—" },
    { key: "mode", label: "Mode", render: v => React.createElement("span", { className: "badge badge-neutral" }, v || "classic") },
    { key: "stake", label: "Stake", render: v => v > 0 ? `${v} pts` : "Free" },
    { key: "reason", label: "Result" },
    { key: "ended_at", label: "Date", render: v => v ? new Date(v).toLocaleDateString() : "—" },
    { key: "voided_at", label: "Status", render: v => v ? React.createElement("span", { className: "badge badge-error" }, "Voided") : React.createElement("span", { className: "badge badge-success" }, "OK") },
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, t("nav.matches")),
    React.createElement(DataTable, { columns, data: matches, total, page, limit: 25, onPageChange: setPage, loading })
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Content Pages
// ═══════════════════════════════════════════════════════════════════════════════
function EmojisPage() {
  const [emojis, setEmojis] = useState([]);
  const api = useApi();
  const toast = useToast();

  useEffect(() => { api.get("/content/emojis").then(d => setEmojis(d.emojis)).catch(() => {}); }, []);

  const toggleActive = async (id, active) => {
    try { await api.put(`/content/emojis/${id}`, { active: !active }); toast.show("Updated"); setEmojis(e => e.map(x => x.id === id ? {...x, active: !active} : x)); }
    catch(e) { toast.show(e.message, "error"); }
  };

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Emojis"),
    React.createElement("div", { className: "card-grid" },
      emojis.map(em => React.createElement("div", { key: em.id, className: "content-card" },
        React.createElement("div", { className: "content-card-header" },
          React.createElement("span", { className: "content-card-name" }, em.name),
          React.createElement("span", { className: `badge ${em.active ? "badge-success" : "badge-neutral"}` }, em.active ? "Active" : "Inactive")
        ),
        React.createElement("div", { className: "content-card-body" }, `Cost: ${em.cost} pts`),
        React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => toggleActive(em.id, em.active) }, em.active ? "Disable" : "Enable")
      ))
    )
  );
}

function AnnouncementsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const api = useApi();
  const toast = useToast();

  const fetch = async (p) => { try { const d = await api.get(`/content/announcements?page=${p}`); setItems(d.announcements); setTotal(d.total); } catch(e){} };
  useEffect(() => { fetch(page); }, [page]);

  const columns = [
    { key: "title_en", label: "Title" },
    { key: "type", label: "Type", render: v => React.createElement("span", { className: `badge badge-${v === "warning" ? "warning" : v === "maintenance" ? "error" : "accent"}` }, v) },
    { key: "active", label: "Active", render: v => v ? "✓" : "—" },
    { key: "start_at", label: "Start", render: v => v ? new Date(v).toLocaleDateString() : "—" },
    { key: "end_at", label: "End", render: v => v ? new Date(v).toLocaleDateString() : "∞" },
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Announcements"),
    React.createElement(DataTable, { columns, data: items, total, page, limit: 25, onPageChange: setPage })
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Moderation Page
// ═══════════════════════════════════════════════════════════════════════════════
function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const api = useApi();
  const toast = useToast();

  const fetch = async (p, s) => { try { const d = await api.get(`/moderation/reports?page=${p}&status=${s}`); setReports(d.reports); setTotal(d.total); } catch(e){} };
  useEffect(() => { fetch(page, statusFilter); }, [page, statusFilter]);

  const resolve = async (id, status) => {
    const resolution = status === "resolved" ? prompt("Resolution notes:") : null;
    try { await api.put(`/moderation/reports/${id}`, { status, resolution }); toast.show("Report updated"); fetch(page, statusFilter); }
    catch(e) { toast.show(e.message, "error"); }
  };

  const columns = [
    { key: "reporter_name", label: "Reporter" },
    { key: "reported_name", label: "Reported" },
    { key: "reason", label: "Reason", render: v => React.createElement("span", { className: "badge badge-warning" }, v) },
    { key: "status", label: "Status", render: v => React.createElement("span", { className: `badge badge-${v === "pending" ? "warning" : v === "resolved" ? "success" : "neutral"}` }, v) },
    { key: "created_at", label: "Date", render: v => v ? new Date(v).toLocaleDateString() : "—" },
    { key: "actions", label: "", render: (_, row) => row.status === "pending" ? React.createElement("div", { className: "row-actions" },
      React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => resolve(row.id, "resolved") }, "Resolve"),
      React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => resolve(row.id, "dismissed") }, "Dismiss"),
    ) : null },
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("div", { className: "page-header" },
      React.createElement("h1", { className: "page-title" }, "Reports"),
      React.createElement("select", { className: "form-input filter-select", value: statusFilter, onChange: e => { setStatusFilter(e.target.value); setPage(1); } },
        React.createElement("option", { value: "pending" }, "Pending"),
        React.createElement("option", { value: "resolved" }, "Resolved"),
        React.createElement("option", { value: "dismissed" }, "Dismissed"),
        React.createElement("option", { value: "all" }, "All"),
      )
    ),
    React.createElement(DataTable, { columns, data: reports, total, page, limit: 25, onPageChange: setPage })
  );
}

function ChatLogsPage() {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roomCode, setRoomCode] = useState("");
  const [userId, setUserId] = useState("");
  const api = useApi();
  const toast = useToast();

  const fetchLogs = async (p) => {
    try {
      let params = `?page=${p}&limit=50`;
      if (roomCode) params += `&roomCode=${encodeURIComponent(roomCode)}`;
      if (userId) params += `&userId=${encodeURIComponent(userId)}`;
      const d = await api.get("/moderation/chat" + params);
      setMessages(d.messages); setTotal(d.total);
    } catch (e) {}
  };
  useEffect(() => { fetchLogs(page); }, [page]);

  const handleSearch = () => { setPage(1); fetchLogs(1); };
  const handleFlag = async (id) => {
    try { await api.post(`/moderation/chat/${id}/flag`, {}); toast.show("Message flagged"); fetchLogs(page); }
    catch (e) { toast.show(e.message, "error"); }
  };

  const columns = [
    { key: "created_at", label: "Time", render: v => v ? new Date(v).toLocaleString() : "—" },
    { key: "room_code", label: "Room" },
    { key: "sender_name", label: "Sender", render: (v, row) => v || row.client_id?.slice(0, 8) || "—" },
    { key: "message", label: "Message" },
    { key: "flagged", label: "Flag", render: (v, row) => v ? React.createElement("span", { className: "badge badge-error" }, "⚑") : React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => handleFlag(row.id) }, "Flag") },
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Chat Logs"),
    React.createElement("div", { className: "table-toolbar" },
      React.createElement("input", { className: "form-input", placeholder: "Room code", value: roomCode, onChange: e => setRoomCode(e.target.value), style: { maxWidth: "160px" } }),
      React.createElement("input", { className: "form-input", placeholder: "User ID", value: userId, onChange: e => setUserId(e.target.value), style: { maxWidth: "120px" } }),
      React.createElement("button", { className: "btn btn-secondary", onClick: handleSearch }, "Search"),
    ),
    React.createElement(DataTable, { columns, data: messages, total, page, limit: 50, onPageChange: setPage, emptyMessage: "No chat logs found. Messages appear here when flagged for review." })
  );
}

function SuspiciousPage() {
  const [items, setItems] = useState([]);
  const api = useApi();

  useEffect(() => { api.get("/moderation/suspicious").then(d => setItems(d.suspicious)).catch(() => {}); }, []);

  const columns = [
    { key: "user_id", label: "ID" },
    { key: "display_name", label: "Player" },
    { key: "wins", label: "Wins" },
    { key: "total", label: "Games" },
    { key: "win_rate", label: "Win Rate", render: v => React.createElement("span", { className: "badge badge-error" }, v + "%") },
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Suspicious Activity"),
    React.createElement(DataTable, { columns, data: items, total: items.length, page: 1, limit: 100, emptyMessage: "No suspicious activity detected" })
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Operations Page
// ═══════════════════════════════════════════════════════════════════════════════
function HealthPage() {
  const [health, setHealth] = useState(null);
  const api = useApi();

  const fetchHealth = () => api.get("/ops/health").then(setHealth).catch(() => {});
  useEffect(() => { fetchHealth(); const i = setInterval(fetchHealth, 10000); return () => clearInterval(i); }, []);

  if (!health) return React.createElement("div", { className: "page" }, "Loading...");

  const MetricBox = ({ label, value, unit }) => React.createElement("div", { className: "metric-card" },
    React.createElement("div", { className: "metric-label" }, label),
    React.createElement("div", { className: "metric-value" }, value, unit && React.createElement("span", { className: "metric-unit" }, " " + unit))
  );

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Server Health"),
    React.createElement("div", { className: "metric-grid metric-grid-4" },
      React.createElement(MetricBox, { label: "Uptime", value: Math.floor(health.uptime / 3600) + "h " + Math.floor((health.uptime % 3600) / 60) + "m" }),
      React.createElement(MetricBox, { label: "Memory (RSS)", value: health.memory.rss, unit: "MB" }),
      React.createElement(MetricBox, { label: "Heap Used", value: health.memory.heapUsed, unit: "MB" }),
      React.createElement(MetricBox, { label: "Online Players", value: health.onlinePlayers }),
      React.createElement(MetricBox, { label: "Active Rooms", value: health.rooms }),
      React.createElement(MetricBox, { label: "PG Pool (idle)", value: health.pgPool.idle + "/" + health.pgPool.total }),
      React.createElement(MetricBox, { label: "Node", value: health.nodeVersion }),
      React.createElement(MetricBox, { label: "PID", value: health.pid }),
    )
  );
}

function MaintenancePage() {
  const [enabled, setEnabled] = useState(false);
  const api = useApi();
  const toast = useToast();

  useEffect(() => { api.get("/ops/maintenance").then(d => setEnabled(d.enabled)).catch(() => {}); }, []);

  const toggle = async () => {
    const next = !enabled;
    if (next && !confirm("Enable maintenance mode? New players will be blocked.")) return;
    try { await api.post("/ops/maintenance", { enabled: next }); setEnabled(next); toast.show(next ? "Maintenance ON" : "Maintenance OFF"); }
    catch(e) { toast.show(e.message, "error"); }
  };

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Maintenance Mode"),
    React.createElement("div", { className: "maintenance-status" },
      React.createElement("span", { className: `badge badge-${enabled ? "error" : "success"}`, style: { fontSize: "16px", padding: "8px 16px" } }, enabled ? "ACTIVE" : "INACTIVE"),
      React.createElement("p", { className: "text-secondary", style: { marginTop: "16px" } }, enabled ? "New player connections are blocked. Existing games can continue." : "Server is operating normally."),
      React.createElement("button", { className: `btn ${enabled ? "btn-secondary" : "btn-danger"}`, style: { marginTop: "16px" }, onClick: toggle }, enabled ? "Disable Maintenance" : "Enable Maintenance")
    )
  );
}

function ConfigPage() {
  const [configs, setConfigs] = useState([]);
  const api = useApi();
  const toast = useToast();

  useEffect(() => { api.get("/ops/config").then(d => setConfigs(d.configs)).catch(() => {}); }, []);

  const columns = [
    { key: "key", label: "Key" },
    { key: "value", label: "Value", render: v => React.createElement("code", null, JSON.stringify(v)) },
    { key: "updated_at", label: "Updated", render: v => v ? new Date(v).toLocaleDateString() : "—" },
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Runtime Config"),
    React.createElement(DataTable, { columns, data: configs, total: configs.length, page: 1, limit: 100 })
  );
}

function BackupPage() {
  const [info, setInfo] = useState(null);
  const [running, setRunning] = useState(false);
  const api = useApi();
  const toast = useToast();

  useEffect(() => { api.get("/ops/backup").then(setInfo).catch(() => {}); }, []);

  const trigger = async () => {
    setRunning(true);
    try { const d = await api.post("/ops/backup", {}); toast.show("Backup complete: " + d.path); setInfo({ lastBackupAt: d.timestamp }); }
    catch(e) { toast.show(e.message, "error"); }
    finally { setRunning(false); }
  };

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Database Backup"),
    React.createElement("div", { className: "backup-info" },
      React.createElement("p", null, "Last backup: ", info?.lastBackupAt ? new Date(info.lastBackupAt).toLocaleString() : "Never"),
      React.createElement("button", { className: "btn btn-primary", onClick: trigger, disabled: running }, running ? "Running..." : "Start Backup")
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Audit Log Page
// ═══════════════════════════════════════════════════════════════════════════════
function AuditPage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const api = useApi();

  useEffect(() => { api.get(`/audit?page=${page}&limit=50`).then(d => { setEntries(d.entries); setTotal(d.total); }).catch(() => {}); }, [page]);

  const columns = [
    { key: "created_at", label: "Time", render: v => v ? new Date(v).toLocaleString() : "—" },
    { key: "admin_name", label: "Admin" },
    { key: "action", label: "Action", render: v => React.createElement("code", null, v) },
    { key: "target_type", label: "Target" },
    { key: "target_id", label: "ID" },
    { key: "ip", label: "IP" },
  ];

  return React.createElement("div", { className: "page" },
    React.createElement("h1", { className: "page-title" }, "Audit Log"),
    React.createElement(DataTable, { columns, data: entries, total, page, limit: 50, onPageChange: setPage })
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Placeholder for pages not yet fully built
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
    "/users": () => React.createElement(UsersPage),
    "/matches": () => React.createElement(MatchesPage),
    "/content/emojis": () => React.createElement(EmojisPage),
    "/content/announcements": () => React.createElement(AnnouncementsPage),
    "/moderation/reports": () => React.createElement(ReportsPage),
    "/moderation/chat": () => React.createElement(ChatLogsPage),
    "/moderation/suspicious": () => React.createElement(SuspiciousPage),
    "/operations/health": () => React.createElement(HealthPage),
    "/operations/config": () => React.createElement(ConfigPage),
    "/operations/backup": () => React.createElement(BackupPage),
    "/operations/maintenance": () => React.createElement(MaintenancePage),
    "/audit": () => React.createElement(AuditPage),
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
