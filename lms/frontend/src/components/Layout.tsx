import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "../types";

export default function Layout({ user, children }: { user: User; children: ReactNode }) {
  const links = user.role === "librarian" ? [["/dashboard", "Library desk"], ["/catalog", "Catalog"]]
    : user.role === "college-admin" || user.role === "admin" ? [["/admin", "Library administration"], ["/catalog", "Catalog"]]
    : [["/catalog", "Catalog"], ["/my-library", "My library"]];
  const signOut = () => { sessionStorage.removeItem("lmsToken"); window.location.assign(import.meta.env.VITE_EDUGUARD_URL || "http://localhost:5173"); };
  return <div className="shell">
    <header className="topbar"><div><span className="brand-mark">E</span><strong>EduGuard Library</strong></div><nav>{links.map(([path, label]) => <NavLink key={path} to={path}>{label}</NavLink>)}</nav><button className="user-button" onClick={signOut}>{user.name}<small>{user.role}</small></button></header>
    <main>{children}</main>
  </div>;
}
