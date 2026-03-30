import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

const HomePage = lazy(() => import("@/view/Home"));

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
