import React from "react";
import ReactDOM from "react-dom/client";
import "./global.less";
import { router } from "./router";
import { RouterProvider } from "react-router-dom";

document.title = "Shadow7 Mail";
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

