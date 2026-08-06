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
      : user.role === "college-admin"
      ? [
          ["/admin", "Administration"],
          ["/reports", "Reports & Analytics"],
          ["/catalog", "Catalog"],
        ]
      : [
          ["/portal", "Student Portal"],
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
        <button className="user-button" onClick={signOut}>
          {user.name}
          <small>{user.role}</small>
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}

