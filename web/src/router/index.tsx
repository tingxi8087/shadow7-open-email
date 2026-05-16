import AuthGate from "@/components/AuthGate";
import Layout from "@/layout/Layout";
import Compose from "@/views/Compose";
import Login from "@/views/Login";
import Mailboxes from "@/views/Mailboxes";
import OutboundSettings from "@/views/OutboundSettings";
import SecuritySettings from "@/views/SecuritySettings";
import Settings from "@/views/Settings";
import Setup from "@/views/Setup";
import { Navigate, createHashRouter } from "react-router-dom";

export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <div className="route-fallback">页面不存在</div>,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: "login",
        element: <Login />,
      },
      {
        element: <AuthGate />,
        children: [
          {
            path: "mailboxes",
            element: <Mailboxes />,
          },
          {
            path: "compose",
            element: <Compose />,
          },
          {
            path: "setup",
            element: <Setup />,
          },
          {
            path: "settings/outbound",
            element: <OutboundSettings />,
          },
          {
            path: "settings/security",
            element: <SecuritySettings />,
          },
          {
            path: "settings",
            element: <Settings />,
          },
        ],
      },
    ],
  },
]);
