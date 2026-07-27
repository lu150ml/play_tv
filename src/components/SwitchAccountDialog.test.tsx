import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SwitchAccountDialog } from "./SwitchAccountDialog";

describe("SwitchAccountDialog", () => {
  it("does not render while closed", () => {
    render(<SwitchAccountDialog isOpen={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps cancel and confirm as separate actions", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<SwitchAccountDialog isOpen onCancel={onCancel} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sair e trocar conta" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
