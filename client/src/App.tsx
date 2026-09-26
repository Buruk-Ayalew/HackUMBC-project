import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth";
import WelcomePage from "./pages/WelcomePage";
import LoginPage from "./pages/LoginPage";
import SetupPage from "./pages/SetupPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import ObligationsPage from "./pages/ObligationsPage";
import WhatIfPage from "./pages/WhatIfPage";
import CalendarPage from "./pages/CalendarPage";
import RadarPage from "./pages/RadarPage";
import LocalRiskPage from "./pages/LocalRiskPage";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/obligations", label: "Obligations" },
  { to: "/calendar", label: "Calendar" },
  { to: "/radar", label: "Radar" },
  { to: "/local-risk", label: "Local Risk" },
  { to: "/settings", label: "Settings" },
];

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <NavLink to={user ? "/dashboard" : "/"} className="text-lg font-bold text-blue-800">
          CivicPulse <span className="text-slate-500">MD</span>
        </NavLink>
        {user && (
          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/obligations" ? false : undefined}
                className={({ isActive }) =>
                  `rounded px-2.5 py-1.5 ${isActive ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <button
              onClick={async () => {
                await logout();
                navigate("/");
              }}
              className="ml-auto rounded px-2.5 py-1.5 text-slate-600 hover:bg-slate-100"
            >
              Log out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 py-6 text-center text-sm text-slate-500">
      Information, not legal advice. Always confirm with the official source.
    </footer>
  );
}

// Requires login; optionally requires that the business profile exists.
function Protected({ children, needsProfile = true }: { children: ReactNode; needsProfile?: boolean }) {
  const { user, hasProfile, loading } = useAuth();
  if (loading) return <p className="p-8 text-slate-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (needsProfile && !hasProfile) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<Protected needsProfile={false}><SetupPage /></Protected>} />
          <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/obligations" element={<Protected><ObligationsPage /></Protected>} />
          <Route path="/obligations/what-if" element={<Protected><WhatIfPage /></Protected>} />
          <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
          <Route path="/radar" element={<Protected><RadarPage /></Protected>} />
          <Route path="/local-risk" element={<Protected><LocalRiskPage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
