import React, { createContext, useState, useEffect, useContext } from "react";
import axios from "axios";

export interface User {
  id: string;
  name: string;
  email?: string;
  role: "mentor" | "admin" | "student";
  assignedClasses?: string[];
  rollNo?: string;
  course?: string;
  class?: string;
  mentorId?: string;
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
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Set default API base URL
axios.defaults.baseURL = "http://localhost:5000";

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
  }) => {
    try {
      const res = await axios.post("/api/auth/register", data);
      if (res.data.success) {
        const { token: jwtToken, data: mentorUser } = res.data;
        localStorage.setItem("token", jwtToken);
        setToken(jwtToken);
        setUser(mentorUser);
        setAuthHeader(jwtToken);
      }
    } catch (err: any) {
      throw new Error(err.response?.data?.message || "Registration failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
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
