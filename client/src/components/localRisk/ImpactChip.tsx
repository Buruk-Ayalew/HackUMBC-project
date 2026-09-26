import { useEffect, useId, useRef, useState } from "react";
import type { ImpactTag } from "../../../../shared/types";
import { IconInfo } from "../icons";
import { IMPACT_BLURB, IMPACT_CHIP, IMPACT_LABEL } from "./format";

// An impact tag with an (i) button that shows a general explanation of the tag.
// Click/tap to open (works on phones); click outside or press Escape to close.
export default function ImpactChip({ tag }: { tag: ImpactTag }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <span className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-semibold ring-1 ring-inset ${IMPACT_CHIP[tag]}`}>
        {IMPACT_LABEL[tag]}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`What "${IMPACT_LABEL[tag]}" means`}
          aria-expanded={open}
          aria-describedby={open ? id : undefined}
          className="grid h-4 w-4 place-items-center rounded-full text-sm opacity-70 hover:opacity-100 focus-visible:outline-2"
        >
          <IconInfo />
        </button>
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute top-full left-0 z-[1000] mt-1.5 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed font-normal text-slate-700 shadow-lg"
        >
          <span className="mb-1 block font-semibold text-slate-900">{IMPACT_LABEL[tag]}</span>
          {IMPACT_BLURB[tag]}
        </span>
      )}
    </span>
  );
}
