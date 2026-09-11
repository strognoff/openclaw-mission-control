"use client";

/**
 * ClientTime / ClientShortTime — render format.ts helpers without
 * triggering React #425 hydration mismatch.
 *
 * SSR + first client paint render an empty placeholder (server and
 * client agree on the initial output). useEffect then computes the
 * real string from the user's clock and ticks it every second.
 *
 * The hydration mismatch came from format.ts calling Date.now() /
 * new Date() / toLocaleTimeString() in pure functions invoked during
 * render — server time and browser time differ by milliseconds, so the
 * two renders produced different text and React threw #425.
 */

import { useEffect, useState } from "react";
import { relativeTime, shortTime } from "@/lib/format";

const EMPTY = "\u00A0"; // non-breaking space, preserves layout

export function ClientTime({ iso }: { iso?: string | null }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    if (!iso) {
      setText("—");
      return;
    }
    const update = () => setText(relativeTime(iso));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return <>{text || EMPTY}</>;
}

export function ClientShortTime({ iso }: { iso?: string | null }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    if (!iso) {
      setText("—");
      return;
    }
    setText(shortTime(iso));
  }, [iso]);
  return <>{text || EMPTY}</>;
}
