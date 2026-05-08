"use client";

import { tone } from "../tokens/design";

/**
 * Bottom-center keymap hint. Shows the City-Skylines-style controls so the
 * user discovers the modifier without reading docs.
 */
export function ControlHint() {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
  const cmd = isMac ? "⌘" : "Ctrl";
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 select-none rounded-full border px-4 py-1.5 text-[11px] backdrop-blur-md"
      style={{
        background: "rgba(10,12,22,0.72)",
        borderColor: tone.border,
        color: tone.ink2,
        boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
      }}
    >
      <span style={{ color: tone.ink }}>拖动平移</span>
      <span className="mx-2" style={{ color: tone.ink3 }}>·</span>
      <Kbd>{cmd}</Kbd>
      <span className="mx-1.5" style={{ color: tone.ink3 }}>+ 拖动旋转</span>
      <span className="mx-2" style={{ color: tone.ink3 }}>·</span>
      <span>滚轮缩放</span>
      <span className="mx-2" style={{ color: tone.ink3 }}>·</span>
      <Kbd>Shift</Kbd>
      <span className="mx-1.5" style={{ color: tone.ink3 }}>+ 滚轮旋转</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        background: "rgba(168,114,255,0.15)",
        color: tone.brandSoft,
        border: "1px solid rgba(168,114,255,0.35)",
        minWidth: 20,
        textAlign: "center",
      }}
    >
      {children}
    </span>
  );
}
