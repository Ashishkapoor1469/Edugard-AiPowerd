import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { getNavigationItems, isNavigationItemActive, NavigationIcon } from "../navigation.js";

export default function BottomNav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  if (!user || user.role === "librarian") return null;
  const items = getNavigationItems(user);

  return <nav aria-label="Mobile navigation" className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[9999] flex h-[calc(72px+env(safe-area-inset-bottom))] items-center justify-around border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] md:hidden">
    {items.map((item) => {
      const active = isNavigationItemActive(location.pathname, item);
      return <NavLink key={item.name} to={item.path} className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-all ${active ? "text-primary" : "text-slate-400 hover:text-text-primary"}`}>
        <span className={`rounded-lg p-1 transition-all ${active ? "bg-primary/5" : ""}`}><NavigationIcon name={item.icon} /></span>{item.name}
      </NavLink>;
    })}
    <div className="relative">
      {showProfileMenu && <div className="absolute bottom-full right-0 mb-3 w-48 rounded-xl border border-slate-100 bg-white py-2 shadow-xl ring-1 ring-black/5">
        <div className="border-b border-slate-100 px-4 py-2"><p className="text-xs font-bold text-text-primary">{user.name}</p><p className="truncate text-[10px] text-slate-400">{user.email}</p></div>
        {user.role === "student" && <button type="button" onClick={() => { setShowProfileMenu(false); navigate("/badge"); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-primary hover:bg-slate-50">My Badges</button>}
        <button type="button" onClick={() => { setShowProfileMenu(false); logout(); navigate("/login"); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-critical hover:bg-slate-50">Sign Out</button>
      </div>}
      <button type="button" aria-expanded={showProfileMenu} onClick={() => setShowProfileMenu((show) => !show)} className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold text-slate-400 transition-all hover:text-text-primary">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">{user.name.substring(0, 2).toUpperCase()}</span>Profile
      </button>
    </div>
  </nav>;
}
