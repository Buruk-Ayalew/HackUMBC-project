import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth";
import { IconClipboard, IconLogo, IconMapPin, IconRadar, IconSettings, IconTrending } from "./components/icons";
import { LoadingPage } from "./components/ui";
import WelcomePage from "./pages/WelcomePage";
import LoginPage from "./pages/LoginPage";
import SetupPage from "./pages/SetupPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import ObligationsPage from "./pages/ObligationsPage";
import WhatIfPage from "./pages/WhatIfPage";
import RadarPage from "./pages/RadarPage";
import BriefingPage from "./pages/BriefingPage";
import LocalRiskPage from "./pages/LocalRiskPage";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: null },
  { to: "/obligations", label: "Obligations", icon: <IconClipboard /> },
  { to: "/growth", label: "Growth Planner", icon: <IconTrending /> },
  { to: "/radar", label: "Radar", icon: <IconRadar /> },
  { to: "/local-risk", label: "Local Risk", icon: <IconMapPin /> },
];

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-[1100] border-b print:hidden border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <NavLink to={user ? "/dashboard" : "/"} className="flex shrink-0 items-center gap-2">
          <IconLogo className="text-3xl text-brand-600" />
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Reg<span className="text-brand-600">Wise</span>
          </span>
        </NavLink>

        {user && (
          <>
            <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 text-sm" aria-label="Main">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition ${
                      isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  {n.icon && <span className="text-base opacity-80">{n.icon}</span>}
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-1">
              <NavLink
                to="/settings"
                title="Settings"
                className={({ isActive }) =>
                  `grid h-9 w-9 place-items-center rounded-lg text-lg transition ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"}`
                }
              >
                <IconSettings />
                <span className="sr-only">Settings</span>
              </NavLink>
              <button
                onClick={async () => {
                  await logout();
                  navigate("/");
                }}
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:block"
              >
                Log out
              </button>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white" title={user.email}>
                {initials}
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500">
        <p>
          <strong className="font-semibold text-slate-700">Information, not legal advice.</strong> Always confirm with the official source.
        </p>
        <p>RegWise · Built for Maryland small businesses</p>
      </div>
    </footer>
  );
}

// Requires login; optionally requires that the business profile exists.
function Protected({ children, needsProfile = true }: { children: ReactNode; needsProfile?: boolean }) {
  const { user, hasProfile, loading } = useAuth();
  if (loading) return <LoadingPage />;
  if (!user) return <Navigate to="/login" replace />;
  if (needsProfile && !hasProfile) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 print:max-w-none print:p-0">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<Protected needsProfile={false}><SetupPage /></Protected>} />
          <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/obligations" element={<Protected><ObligationsPage /></Protected>} />
          <Route path="/growth" element={<Protected><WhatIfPage /></Protected>} />
          <Route path="/obligations/what-if" element={<Navigate to="/growth" replace />} />
          <Route path="/calendar" element={<Navigate to="/obligations" replace />} />
          <Route path="/radar" element={<Protected><RadarPage /></Protected>} />
          <Route path="/briefing" element={<Protected><BriefingPage /></Protected>} />
          <Route path="/local-risk" element={<Protected><LocalRiskPage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
