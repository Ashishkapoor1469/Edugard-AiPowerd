import React, { createContext, useState, useEffect, useContext } from "react";
import axios from "axios";
import socket from "../utils/socket.js";
import { installHttpCache } from "../utils/httpCache.js";
import { initializeMobilePush, unregisterMobilePush } from "../utils/mobilePush.js";

export interface User {
  id: string;
  name: string;
  email?: string;
  role: "mentor" | "admin" | "student" | "college-admin" | "librarian";
  status?: "pending_verification" | "approved" | "rejected" | "disabled" | string;
  assignedClasses?: string[];
  rollNo?: string;
  course?: string;
  class?: string;
  mentorId?: string;
  collegeId?: string;
  collegeName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    assignedClasses?: string[];
    department?: string;
    collegeId?: string;
    assignedCourseId?: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
axios.defaults.baseURL = apiUrl;
installHttpCache();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  // Set axios auth header
  const setAuthHeader = (jwt: string | null) => {
    if (jwt) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${jwt}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (token) {
        setAuthHeader(token);
        try {
          const res = await axios.get("/api/auth/me");
          if (res.data.success) {
            setUser(res.data.data);
            void initializeMobilePush();
          } else {
            logout();
          }
        } catch (err) {
          console.error("Token verification failed:", err);
          logout();
        }
      }
      setLoading(false);
    };

    fetchUser();
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const res = await axios.post("/api/auth/login", { email, password });
      if (res.data.success) {
        const { token: jwtToken, data: mentorUser } = res.data;
        localStorage.setItem("token", jwtToken);
        setToken(jwtToken);
        setUser(mentorUser);
        setAuthHeader(jwtToken);
        void initializeMobilePush();
      }
    } catch (err: any) {
      throw new Error(err.response?.data?.message || "Login failed");
    }
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    assignedClasses?: string[];
    department?: string;
    collegeId?: string;
    assignedCourseId?: string;
  }) => {
    try {
      const res = await axios.post("/api/auth/register", data);
      if (res.data.success) {
        const { token: jwtToken, data: mentorUser } = res.data;
        localStorage.setItem("token", jwtToken);
        setToken(jwtToken);
        setUser(mentorUser);
        setAuthHeader(jwtToken);
        void initializeMobilePush();
      }
    } catch (err: any) {
      throw new Error(err.response?.data?.message || "Registration failed");
    }
  };

  const logout = () => {
    void unregisterMobilePush();
    localStorage.clear();
    sessionStorage.clear();
    socket.disconnect();
    setToken(null);
    setUser(null);
    setAuthHeader(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
