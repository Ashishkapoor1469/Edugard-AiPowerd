import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { getNavigationItems, isNavigationItemActive, NavigationIcon } from "../navigation.js";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (!user || user.role === "librarian") return null;

  return <aside className="hidden h-[calc(100dvh-4rem)] w-60 flex-col justify-between border-r border-slate-200 bg-white p-4 md:flex">
    <nav aria-label="Workspace navigation" className="flex flex-col gap-1">
      {getNavigationItems(user).map((item) => {
        const active = isNavigationItemActive(location.pathname, item);
        return <NavLink key={item.name} to={item.path} className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${active ? "bg-primary text-white shadow-md shadow-primary/10" : "text-secondary hover:bg-slate-50 hover:text-text-primary"}`}>
          <NavigationIcon name={item.icon} />{item.name}
        </NavLink>;
      })}
    </nav>
    <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
      <div className="flex items-center gap-3 px-2"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-primary">{user.name.substring(0, 2).toUpperCase()}</span><span className="flex min-w-0 flex-col"><span className="truncate text-xs font-bold text-text-primary">{user.name}</span><span className="mt-1 inline-flex max-w-fit items-center rounded-md bg-primary/5 px-2 py-0.5 text-[9px] font-bold capitalize text-primary">{user.role}</span></span></div>
      <button type="button" onClick={() => { logout(); navigate("/login"); }} className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold text-critical transition-all hover:bg-red-50 hover:text-red-700">Logout</button>
    </div>
  </aside>;
}
