"use client";

import { Check, Library } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { addReelToCollection } from "@/app/actions";

export interface CollectionOption {
  id: string;
  name: string;
}

export function CollectionAddButton({
  reelId,
  collections,
  className = "",
}: {
  reelId: string;
  collections: CollectionOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (collections.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Add to collection"
        aria-expanded={open}
        title="Add to collection"
        className={`grid place-items-center text-white/90 transition-transform active:scale-90 hover:text-white ${className}`}
      >
        <Library size={24} />
      </button>
      {open && (
        <div
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-full bottom-0 z-40 mb-1 mr-2 max-h-48 min-w-[10rem] overflow-y-auto rounded-lg border border-white/15 bg-black/90 py-1 shadow-lg backdrop-blur-md"
        >
          {collections.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                startTransition(async () => {
                  await addReelToCollection(c.id, reelId);
                  setAddedTo(c.id);
                  setOpen(false);
                });
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${
                addedTo === c.id ? "text-white" : "text-white/80"
              }`}
            >
              {addedTo === c.id && <Check size={14} className="shrink-0" />}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
