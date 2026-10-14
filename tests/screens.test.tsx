import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import App from "../src/App";

it("renders the demo and navigates through all player sections without network calls", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected network request"));
  render(<App />);
  expect(
    await screen.findByText("Demo: Player. Changes stay in this browser."),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { hidden: true, name: "Reset demo" }),
  ).toBeTruthy();
  for (const section of ["Journal", "Hirelings", "Territories", "Wallet"]) {
    const navigation = screen.getAllByRole("button", {
      hidden: true,
      name: section,
    });
    fireEvent.click(navigation[0]);
    await waitFor(() =>
      expect(
        document.querySelector(".desktop-nav button.active")?.textContent,
      ).toContain(section),
    );
  }
  expect(network).not.toHaveBeenCalled();
}, 30_000);
