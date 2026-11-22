import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../context/ToastContext";

export function renderWithRouter(ui, { route = "/", path = "*" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/app/*" element={<div>APP HOME</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}
