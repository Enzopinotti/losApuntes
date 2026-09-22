import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { JSX } from "react";

export const PrivateRoute = ({ children }: { children: JSX.Element }) => {
  const { token } = useAuth();
  return token ? children : <Navigate to={"/login"} />;
};
