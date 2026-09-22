import type { RouteObject } from "react-router-dom";
import Home from "../pages/Home";
import Layout from "../layouts/Layout";
import Dashboard from "../pages/Dashboard";
import SignUp from "../pages/SignUp";
import Login from "../pages/Login";
import { PrivateRoute } from "./PrivateRoute";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { path: "", element: <Home /> },
      { path: "sign-up", element: <SignUp /> },
      { path: "login", element: <Login /> },
      {
        path: "dashboard",
        element: (
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        ),
      },
    ],
  },
];
