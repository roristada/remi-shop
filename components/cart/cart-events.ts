import type { AddedCartItem } from "@/lib/cart/actions";

// Same-tab signals between buy buttons / cart controls and the header cart. Display only:
// the badge re-reads the real count from the server.
const ADDED = "remi:cart-added";
const CHANGED = "remi:cart-changed";

export type CartAddedDetail = { item: AddedCartItem; count: number };

export function emitCartAdded(detail: CartAddedDetail) {
  window.dispatchEvent(new CustomEvent<CartAddedDetail>(ADDED, { detail }));
}

export function emitCartChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

export function onCartAdded(handler: (detail: CartAddedDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CartAddedDetail>).detail);
  window.addEventListener(ADDED, listener);
  return () => window.removeEventListener(ADDED, listener);
}

export function onCartChanged(handler: () => void): () => void {
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}
