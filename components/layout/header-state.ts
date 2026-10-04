"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "@/i18n/navigation";
import { getHeaderState, type HeaderState } from "@/lib/notifications/actions";
import { onCartChanged } from "@/components/cart/cart-events";

// Header badges (cart count, unread notifications) shared by the cart button and the bell, so a page
// costs at most one server call for both. Every page is rendered per request, so a refetch on each
// navigation would add a function invocation per page view; instead the badges refresh only when
// something could have changed them. Display only: the server re-checks everything on use.

const GUEST: HeaderState = { cartCount: 0, unread: null };

/** Pages where the badges may have changed: checkout lands on an order, reorder on the cart. */
const REFRESH_PATH = /^\/(cart|orders|account|downloads|admin)(\/|$)/;

/** A tab returning to focus refetches at most this often. */
const FOCUS_REFRESH_MS = 60_000;

let state: HeaderState | null = null;
let inflight: Promise<void> | null = null;
let lastFetch = 0;
/** Set once a signed-in fetch has started; an expired cookie returning guest badges must not refetch per page. */
let fetchedForSession = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshHeaderState(): Promise<void> {
  inflight ??= getHeaderState()
    .then((next) => {
      state = next;
      lastFetch = Date.now();
      emit();
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Local update after an action that already returned the new value (cart add, mark read). */
export function patchHeaderState(patch: Partial<HeaderState>) {
  if (!state) return;
  state = { ...state, ...patch };
  emit();
}

/**
 * `hasSession` comes from the server-rendered header (auth cookie present). Guests never fetch;
 * login and logout re-render the header, flipping it and triggering a fetch.
 */
export function useHeaderState(hasSession: boolean): HeaderState | null {
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(subscribe, () => state, () => null);

  useEffect(() => {
    if (!hasSession) {
      fetchedForSession = false;
      state = GUEST;
      emit();
      return;
    }
    if (!fetchedForSession || REFRESH_PATH.test(pathname)) {
      fetchedForSession = true;
      void refreshHeaderState();
    }
  }, [hasSession, pathname]);

  useEffect(() => {
    if (!hasSession) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch > FOCUS_REFRESH_MS) {
        void refreshHeaderState();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const offCart = onCartChanged(() => void refreshHeaderState());
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      offCart();
    };
  }, [hasSession]);

  return hasSession ? snapshot : GUEST;
}
