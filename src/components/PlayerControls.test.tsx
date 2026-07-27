import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlayerControls } from "./PlayerControls";

function renderControls(onVolumeChange = vi.fn(), onToggleMute = vi.fn()) {
  render(
    <PlayerControls
      isPlaying={false}
      isVisible
      positionSeconds={10}
      durationSeconds={100}
      volume={0.75}
      muted={false}
      onTogglePlay={vi.fn()}
      onSeek={vi.fn()}
      onFullscreen={vi.fn()}
      onVolumeChange={onVolumeChange}
      onToggleMute={onToggleMute}
    />
  );
  return { onVolumeChange, onToggleMute };
}

describe("PlayerControls volume", () => {
  it("changes volume through the range control", () => {
    const { onVolumeChange } = renderControls();
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0.35" }
    });
    expect(onVolumeChange).toHaveBeenCalledWith(0.35);
  });

  it("toggles mute through the audio button", () => {
    const { onToggleMute } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Silenciar" }));
    expect(onToggleMute).toHaveBeenCalledOnce();
  });
});
