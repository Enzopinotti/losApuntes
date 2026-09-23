import type { RouteObject } from "react-router-dom";
import Layout from "../layouts/Layout";
import AccountRestricted from "../pages/AccountRestricted";
import Dashboard from "../pages/Dashboard";
import ForgotPassword from "../pages/ForgotPassword";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Network from "../pages/Network";
import Notifications from "../pages/Notifications";
import Questions from "../pages/Questions";
import Profile from "../pages/Profile";
import PublicProfile from "../pages/PublicProfile";
import ResetPassword from "../pages/ResetPassword";
import Resources from "../pages/Resources";
import Search from "../pages/Search";
import Security from "../pages/Security";
import SignUp from "../pages/SignUp";
import VerificationPending from "../pages/VerificationPending";
import VerifyEmail from "../pages/VerifyEmail";
import { PrivateRoute } from "./PrivateRoute";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { path: "", element: <Home /> },
      { path: "sign-up", element: <SignUp /> },
      { path: "login", element: <Login /> },
      { path: "verify-email/pending", element: <VerificationPending /> },
      { path: "auth/verify-email", element: <VerifyEmail /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "auth/reset-password", element: <ResetPassword /> },
      { path: "account/restricted", element: <AccountRestricted /> },
      { path: "p/:profileId", element: <PublicProfile /> },
      { path: "resources", element: <Resources /> },
      { path: "search", element: <Search /> },
      { path: "questions", element: <Questions /> },
      {
        path: "dashboard",
        element: (
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        ),
      },
      {
        path: "profile",
        element: (
          <PrivateRoute>
            <Profile />
          </PrivateRoute>
        ),
      },
      {
        path: "network",
        element: (
          <PrivateRoute>
            <Network />
          </PrivateRoute>
        ),
      },
      {
        path: "notifications",
        element: (
          <PrivateRoute>
            <Notifications />
          </PrivateRoute>
        ),
      },
      {
        path: "settings/security",
        element: (
          <PrivateRoute>
            <Security />
          </PrivateRoute>
        ),
      },
    ],
  },
];
