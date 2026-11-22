import { describe, expect, it } from "vitest";
import { validateAppointment } from "../pages/Appointments";
import { validateConsultation } from "../pages/Consultations";
import { validateMedication } from "../pages/Medications";
import { passwordChecks } from "../pages/Register";
import { validateFile } from "../pages/Upload";

describe("form validation", () => {
  it("password rules", () => {
    expect(passwordChecks("weak").every((c) => c.ok)).toBe(false);
    expect(passwordChecks("Strong123").every((c) => c.ok)).toBe(true);
  });
  it("medication requires name, dosage, frequency and valid times", () => {
    const base = { name: "Metformin", dosage: "500 mg", frequency: "Twice daily", start_date: "", end_date: "", schedules: [] };
    expect(validateMedication(base)).toEqual({});
    expect(validateMedication({ ...base, dosage: "" }).dosage).toBeTruthy();
    expect(validateMedication({ ...base, start_date: "2026-02-02", end_date: "2026-01-01" }).end_date).toBeTruthy();
    expect(validateMedication({ ...base, schedules: [{ time_of_day: "" }] }).schedules).toBeTruthy();
  });
  it("appointment requires title and time", () => {
    expect(validateAppointment({ title: "", scheduled_at: "" })).toHaveProperty("title");
    expect(validateAppointment({ title: "Eye check", scheduled_at: "2030-01-01T10:00" })).toEqual({});
  });
  it("consultation date cannot be in the future", () => {
    expect(validateConsultation({ doctor_name: "Dr. A", consultation_date: "2999-01-01", follow_up_date: "" }).consultation_date).toBeTruthy();
    expect(validateConsultation({ doctor_name: "Dr. A", consultation_date: "2020-01-01", follow_up_date: "2019-01-01" }).follow_up_date).toBeTruthy();
  });
  it("upload accepts only allowed types and sizes", () => {
    expect(validateFile(new File(["x"], "a.exe"))).toMatch(/Unsupported/);
    expect(validateFile(new File(["%PDF"], "rx.pdf", { type: "application/pdf" }))).toBe("");
    const big = new File(["x"], "big.pdf"); Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    expect(validateFile(big)).toMatch(/too large/);
  });
});
