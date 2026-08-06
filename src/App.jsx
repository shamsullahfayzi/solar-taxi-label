import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import ControllerPage from "./pages/ControllerPage";
import SettingsPage from "./pages/SettingsPage";
import VehiclePage from "./pages/VehiclePage";

const TABS = [
  { to: "/controller", label: "Controller" },
  { to: "/vehicle", label: "Vehicle" },
  { to: "/settings", label: "Settings" },
];

function Nav() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 flex"
      style={{ background: "#0B0F13f2", borderTop: "1px solid #1B242C", backdropFilter: "blur(12px)" }}
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className="flex-1 h-14 flex items-center justify-center text-xs"
          style={({ isActive }) => ({
            color: isActive ? "#3ED6D0" : "#5C6B77",
            borderTop: `2px solid ${isActive ? "#3ED6D0" : "transparent"}`,
          })}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="pb-14" style={{ background: "#080B0E", minHeight: "100vh" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/controller" replace />} />
          <Route path="/controller" element={<ControllerPage />} />
          <Route path="/vehicle" element={<VehiclePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      <Nav />
    </BrowserRouter>
  );
}
