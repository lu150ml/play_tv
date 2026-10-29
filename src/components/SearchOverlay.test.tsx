import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mockCatalog } from "../data/mockCatalog";
import { SearchOverlay } from "./SearchOverlay";

function renderOverlay() {
  const onSubmit = vi.fn();
  const onClear = vi.fn();
  const onChange = vi.fn();
  render(
    <SearchOverlay
      filters={{ type: "movie", sort: "featured", genre: "Action" }}
      catalog={mockCatalog}
      onChange={onChange}
      onSubmit={onSubmit}
      onClear={onClear}
    />
  );
  return { onSubmit, onClear, onChange };
}

describe("SearchOverlay", () => {
  it("submits with the Buscar button without a typed title", () => {
    const { onSubmit } = renderOverlay();
    fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits when Enter is pressed in the title field", () => {
    const { onSubmit } = renderOverlay();
    fireEvent.submit(screen.getByLabelText("Search catalog"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("clears the filters with Limpar", () => {
    const { onClear, onSubmit } = renderOverlay();
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
