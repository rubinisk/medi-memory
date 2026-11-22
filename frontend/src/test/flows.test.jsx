import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", async (orig) => {
  const actual = await orig();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), interceptors: actual.api.interceptors } };
});

import { api } from "../services/api";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import AppLayout from "../layouts/AppLayout";
import Assistant from "../pages/Assistant";
import Login from "../pages/Login";
import Medications from "../pages/Medications";
import Upload from "../pages/Upload";
import { renderWithRouter } from "./utils";

const USER = { id: 1, email: "demo@medimemory.app", full_name: "Ananya Sharma", is_demo: true, created_at: "2026-01-01", profile: { ai_data_consent: true } };

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); window.HTMLElement.prototype.scrollIntoView = vi.fn(); });

describe("authentication flow", () => {
  it("validates input and logs in", async () => {
    api.post.mockResolvedValueOnce({ data: { access_token: "tok", user: USER } });
    render(<MemoryRouter initialEntries={["/login"]}><ToastProvider><AuthProvider><Routes>
      <Route path="/login" element={<Login />} /><Route path="/app" element={<div>APP HOME</div>} /></Routes></AuthProvider></ToastProvider></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "demo@medimemory.app");
    await userEvent.type(screen.getByLabelText("Password"), "Demo@1234");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByText("APP HOME");
    expect(api.post).toHaveBeenCalledWith("/api/auth/login", { email: "demo@medimemory.app", password: "Demo@1234" });
    expect(sessionStorage.getItem("medimemory_token")).toBe("tok");
  });

  it("shows the server error on bad credentials", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401, data: { detail: "Incorrect email or password." } } });
    render(<MemoryRouter initialEntries={["/login"]}><ToastProvider><AuthProvider><Routes><Route path="/login" element={<Login />} /></Routes></AuthProvider></ToastProvider></MemoryRouter>);
    await userEvent.type(screen.getByLabelText("Email"), "x@y.com");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });
});

describe("navigation and mobile menu", () => {
  it("renders every sidebar section and opens the mobile menu", async () => {
    sessionStorage.setItem("medimemory_token", "tok");
    api.get.mockImplementation((url) => Promise.resolve({ data: url === "/api/auth/me" ? USER : [] }));
    render(<MemoryRouter initialEntries={["/app"]}><ToastProvider><AuthProvider><Routes>
      <Route path="/app" element={<AppLayout />}><Route index element={<div>OVERVIEW PAGE</div>} /></Route></Routes></AuthProvider></ToastProvider></MemoryRouter>);
    await screen.findByText("OVERVIEW PAGE");
    for (const label of ["Overview", "Medical Records", "Consultations", "AI Assistant", "Voice Assistant", "Medications", "Appointments", "Family Access", "Settings"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
    await userEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Close menu"));
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });
});

describe("document upload", () => {
  it("rejects unsupported files and uploads a PDF", async () => {
    api.post.mockResolvedValueOnce({ data: { id: 42 } });
    renderWithRouter(<Upload />, { route: "/app/records/upload", path: "/app/records/upload" });
    const input = screen.getByTestId("file-input");
    fireEvent.change(input, { target: { files: [new File(["MZ"], "bad.exe")] } });
    expect(await screen.findByText(/Unsupported file type/)).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "rx.pdf", { type: "application/pdf" })] } });
    await userEvent.click(screen.getByRole("button", { name: "Upload and extract" }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/api/documents");
    expect(body.get("file").name).toBe("rx.pdf");
    expect(body.get("title")).toBe("rx");
  });
});

describe("AI assistant chat", () => {
  it("sends a question and shows a grounded answer with sources", async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("sessions") ? [] : url.includes("voice") ? { configured: false } : { mode: "extractive", llm_configured: false } }));
    api.post.mockResolvedValueOnce({ data: { session_id: 7,
      question: { id: 1, role: "user", content: "What medicines?", sources: [], created_at: "" },
      answer: { id: 2, role: "assistant", content: "Amlodipine 5 mg once daily.", answer_type: "grounded", generator: "extractive", created_at: "",
        sources: [{ source_type: "consultation", source_id: 3, label: "Consultation with Dr. Meera Iyer", date: "2026-11-12", status: "confirmed", excerpt: "…", score: 0.5 }] } } });
    renderWithRouter(<Assistant />);
    await userEvent.type(screen.getByLabelText("Your question"), "What medicines?");
    await userEvent.click(screen.getByLabelText("Send question"));
    expect(await screen.findByText("Amlodipine 5 mg once daily.")).toBeInTheDocument();
    expect(screen.getByText("From your records")).toBeInTheDocument();
    expect(screen.getByText(/Consultation with Dr. Meera Iyer/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/assistant/ask", { question: "What medicines?", session_id: null, channel: "text" });
  });

  it("labels not-found answers", async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes("sessions") ? [] : {} }));
    api.post.mockResolvedValueOnce({ data: { session_id: 1, question: { id: 1, role: "user", content: "x?", sources: [] },
      answer: { id: 2, role: "assistant", content: "I couldn't find this information in your saved medical records.", answer_type: "not_found", sources: [] } } });
    renderWithRouter(<Assistant />);
    await userEvent.type(screen.getByLabelText("Your question"), "Any surgery?");
    await userEvent.click(screen.getByLabelText("Send question"));
    expect(await screen.findByText("Not in your records")).toBeInTheDocument();
  });
});

describe("medication management", () => {
  it("validates and saves a new medication", async () => {
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValueOnce({ data: { id: 1 } });
    renderWithRouter(<Medications />);
    await userEvent.click(await screen.findByRole("button", { name: /Add medication/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter the medicine name.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Medicine name"), "Metformin");
    await userEvent.type(screen.getByLabelText("Dosage (as prescribed)"), "500 mg");
    await userEvent.type(screen.getByLabelText("Frequency"), "Twice daily");
    await userEvent.click(screen.getByRole("button", { name: /Add time/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/api/medications");
    expect(body).toMatchObject({ name: "Metformin", dosage: "500 mg", frequency: "Twice daily", schedules: [{ time_of_day: "08:00" }] });
  });
});
