import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  afterEach(() => {
    delete (window as unknown as { serverXtreme?: unknown }).serverXtreme;
  });

  it("shows and hides the password through an accessible toggle", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const password = screen.getByLabelText("Senha");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar senha" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("hides the uninstall button outside the desktop app", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /Desinstalar e apagar tudo/ })).toBeNull();
  });

  it("asks the desktop app to wipe everything from the start screen", () => {
    const resetEverything = vi.fn().mockResolvedValue(true);
    (window as unknown as { serverXtreme: unknown }).serverXtreme = { app: { resetEverything } };
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /Desinstalar e apagar tudo/ }));
    expect(resetEverything).toHaveBeenCalledTimes(1);
  });
});
