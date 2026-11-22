import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "../services/api";

const AuthContext = createContext(null);

function applyAccessibility(profile) {
  const html = document.documentElement;
  html.classList.toggle("mm-large-text", !!profile?.large_text);
  html.classList.toggle("mm-high-contrast", !!profile?.high_contrast);
  html.classList.toggle("mm-reduce-motion", !!profile?.reduce_motion);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const clear = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    applyAccessibility(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    if (!tokenStore.get()) return;
    api.get("/api/auth/me")
      .then((r) => { setUser(r.data); applyAccessibility(r.data.profile); })
      .catch(clear)
      .finally(() => setLoading(false));
  }, [clear]);

  const accept = (data) => {
    tokenStore.set(data.access_token);
    setUser(data.user);
    applyAccessibility(data.user.profile);
    return data.user;
  };

  const login = async (email, password) => accept((await api.post("/api/auth/login", { email, password })).data);
  const register = async (full_name, email, password) =>
    accept((await api.post("/api/auth/register", { full_name, email, password })).data);
  const logout = async () => {
    try { await api.post("/api/auth/logout"); } catch { /* token may already be invalid */ }
    clear();
  };
  const updateProfile = async (patch) => {
    const r = await api.patch("/api/auth/me", patch);
    setUser(r.data);
    applyAccessibility(r.data.profile);
    return r.data;
  };

  const value = useMemo(() => ({ user, loading, login, register, logout, updateProfile, setUser }), [user, loading]); // eslint-disable-line
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
