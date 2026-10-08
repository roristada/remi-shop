"use client";

import { useRef } from "react";

/**
 * Props for a DropdownMenuContent: when an item is picked with a mouse or finger, focus is not
 * handed back to the trigger (Chrome would draw its focus ring on it). Keyboard users still get
 * focus returned, and the ring, as usual.
 */
export function usePointerMenuFocus() {
  const pickedWithPointer = useRef(false);
  return {
    onPointerDown: () => {
      pickedWithPointer.current = true;
    },
    onCloseAutoFocus: (e: Event) => {
      if (pickedWithPointer.current) e.preventDefault();
      pickedWithPointer.current = false;
    },
  };
}
