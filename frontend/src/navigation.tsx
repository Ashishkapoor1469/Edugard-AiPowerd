import type { User } from "./context/AuthContext.js";

export type NavigationIconName = "dashboard" | "profile" | "assignments" | "students" | "classes" | "alerts" | "library";
export type NavigationItem = { name: string; path: string; matchPath: string; icon: NavigationIconName };

export const getNavigationItems = (user: User): NavigationItem[] => {
  switch (user.role) {
    case "student":
      return [
        { name: "Profile", path: "/", matchPath: "/", icon: "profile" },
        { name: "Assignments", path: "/assignments", matchPath: "/assignments", icon: "assignments" },
      ];
    case "mentor": {
      const assignedClass = user.assignedClasses?.[0];
      return [
        { name: "Dashboard", path: "/", matchPath: "/", icon: "dashboard" },
        { name: "Students", path: "/students", matchPath: "/students", icon: "students" },
        ...(assignedClass ? [{ name: "Classes", path: `/class/${encodeURIComponent(assignedClass)}`, matchPath: "/class", icon: "classes" as const }] : []),
        { name: "Alerts", path: "/notifications", matchPath: "/notifications", icon: "alerts" },
      ];
    }
    case "college-admin":
      return [
        { name: "Dashboard", path: "/", matchPath: "/", icon: "dashboard" },
        { name: "Library", path: "/library", matchPath: "/library", icon: "library" },
      ];
    case "librarian":
      return [{ name: "Library", path: "/", matchPath: "/", icon: "library" }];
    case "admin":
      return [{ name: "Dashboard", path: "/", matchPath: "/", icon: "dashboard" }];
  }
};

export const isNavigationItemActive = (pathname: string, item: NavigationItem) =>
  item.matchPath === "/" ? pathname === "/" : pathname.startsWith(item.matchPath);

export const canSearchStudents = (role?: User["role"]) => role === "mentor" || role === "college-admin" || role === "admin";
export const canUseNotifications = (role?: User["role"]) => role === "mentor";

export function NavigationIcon({ name, className = "h-5 w-5" }: { name: NavigationIconName; className?: string }) {
  const paths: Record<NavigationIconName, string[]> = {
    dashboard: ["M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z"],
    profile: ["M5.121 17.804A8.966 8.966 0 0112 15c2.21 0 4.232.8 5.793 2.126M15 11a3 3 0 11-6 0 3 3 0 016 0z", "M12 21a9 9 0 100-18 9 9 0 000 18z"],
    assignments: ["M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"],
    students: ["M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"],
    classes: ["M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"],
    alerts: ["M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"],
    library: ["M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5V5a2 2 0 012-2h14v14H6.5A2.5 2.5 0 004 19.5z"],
  };
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">{paths[name].map((path) => <path key={path} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={path} />)}</svg>;
}
