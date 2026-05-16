import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { request } from "@/http/request";

type AuthState = "checking" | "authorized" | "unauthorized";

export default function AuthGate() {
  const location = useLocation();
  const [state, setState] = useState<AuthState>("checking");

  useEffect(() => {
    setState("checking");
    request
      .get("/api/auth/me")
      .then(() => setState("authorized"))
      .catch(() => setState("unauthorized"));
  }, [location.pathname]);

  if (state === "checking") {
    return <div className="route-fallback">正在验证登录状态...</div>;
  }

  if (state === "unauthorized") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
