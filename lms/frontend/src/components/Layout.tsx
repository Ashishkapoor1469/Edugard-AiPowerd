import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "../types";
import eduGuardLogo from "../assets/e.png";

export default function Layout({ user, children }: { user: User; children: ReactNode }) {
  const links =
    user.role === "librarian"
      ? [
          ["/dashboard", "Library Desk"],
          ["/reports", "Reports & Analytics"],
          ["/catalog", "Catalog"],
        ]
      : [
          ["/admin", "Administration"],
          ["/reports", "Reports & Analytics"],
          ["/catalog", "Catalog"],
        ];

  const signOut = () => {
    sessionStorage.removeItem("lmsToken");
    window.location.assign(import.meta.env.VITE_EDUGUARD_URL || "https://edugard-ai-powerd.vercel.app");
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <img className="brand-logo" src={eduGuardLogo} alt="EduGuard" />
          <strong>EduGuard Library</strong>
        </div>
        <nav>
          {links.map(([path, label]) => (
            <NavLink key={path} to={path}>
              {label}
            </NavLink>
          ))}
        </nav>
        <button className="user-button" onClick={signOut} title="Click to Sign Out">
          <span className="user-name">{user.name}</span>
          <span className="user-role-badge">
            {user.role === "college-admin" ? "College Admin" : "Librarian"}
          </span>
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}
