import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api", async (orig) => {
  const actual = await orig();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});
import { api } from "../services/api";
import Appointments from "../pages/Appointments";
import { renderWithRouter } from "./utils";

beforeEach(() => vi.clearAllMocks());

describe("appointment management", () => {
  it("lists upcoming appointments and deletes one", async () => {
    const future = new Date(Date.now() + 5 * 864e5).toISOString();
    api.get.mockResolvedValue({ data: [{ id: 9, title: "Repeat blood test", scheduled_at: future, status: "scheduled", is_follow_up: true, hospital: "Lab", reminder_minutes_before: 60 }] });
    api.delete.mockResolvedValueOnce({});
    renderWithRouter(<Appointments />);
    expect(await screen.findByText("Repeat blood test")).toBeInTheDocument();
    expect(screen.getByText("Upcoming (1)")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Delete Repeat blood test"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.delete).toHaveBeenCalledWith("/api/appointments/9");
  });

  it("switches to the calendar view", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderWithRouter(<Appointments />);
    await userEvent.click(await screen.findByRole("tab", { name: /Calendar/ }));
    expect(screen.getByLabelText("Next month")).toBeInTheDocument();
  });
});
