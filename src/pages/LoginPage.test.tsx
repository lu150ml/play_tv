import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/sessionService", () => ({
  connectServerSession: vi.fn()
}));

import { connectServerSession } from "../services/sessionService";
import { LoginPage } from "./LoginPage";

const mockedConnect = vi.mocked(connectServerSession);

function setValueWithoutInputEvent(element: HTMLElement, value: string) {
  if (!(element instanceof HTMLInputElement)) throw new Error("Expected an input element.");
  element.value = value;
}

beforeEach(() => {
  mockedConnect.mockReset();
});

describe("LoginPage Android autofill", () => {
  it("não oferece mais acesso ao catálogo de demonstração", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /demonstração/i })).not.toBeInTheDocument();
  });

  it("submits the visible autofilled values even when Android emits no input event", async () => {
    mockedConnect.mockRejectedValue(new Error("Servidor indisponível para o teste."));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const server = screen.getByLabelText("Endereço do servidor");
    const username = screen.getByLabelText("Usuário");
    const password = screen.getByLabelText("Senha");

    act(() => {
      setValueWithoutInputEvent(server, "http://iptv.example:8080");
      setValueWithoutInputEvent(username, "viewer");
      setValueWithoutInputEvent(password, "secret-value");
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => {
      expect(mockedConnect).toHaveBeenCalledWith({
        serverUrl: "http://iptv.example:8080",
        username: "viewer",
        password: "secret-value",
        remember: true
      });
    });
    expect(await screen.findByText("Servidor indisponível para o teste.")).toBeInTheDocument();
    expect(server).toHaveValue("http://iptv.example:8080");
    expect(username).toHaveValue("viewer");
    expect(password).toHaveValue("secret-value");
  });

  it("keeps normally typed values after a failed connection", async () => {
    mockedConnect.mockRejectedValue(new Error("Credenciais recusadas."));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const server = screen.getByLabelText("Endereço do servidor");
    const username = screen.getByLabelText("Usuário");
    const password = screen.getByLabelText("Senha");
    fireEvent.change(server, { target: { value: "http://iptv.example:8080" } });
    fireEvent.change(username, { target: { value: "viewer" } });
    fireEvent.change(password, { target: { value: "secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText("Credenciais recusadas.")).toBeInTheDocument();
    expect(server).toHaveValue("http://iptv.example:8080");
    expect(username).toHaveValue("viewer");
    expect(password).toHaveValue("secret-value");
  });
});
