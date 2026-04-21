"use client";

import {
  type PlateElementProps,
  PlateElement,
  useElement,
} from "platejs/react";
import { useEffect, useState } from "react";

type LivePassportViewNode = {
  type: "live-passport-view";
  passportId?: string;
  children: { text: string }[];
};

export function LivePassportViewElement(props: PlateElementProps) {
  return (
    <PlateElement {...props}>
      <div contentEditable={false} className="my-4 select-none">
        <LivePassportViewInner />
      </div>
      {props.children}
    </PlateElement>
  );
}

function LivePassportViewInner() {
  const element = useElement<LivePassportViewNode>();
  const passportId = element.passportId ?? "p-000";
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    setCounter(0);
    const id = window.setInterval(() => {
      setCounter((c) => c + 1);
    }, 2000);
    return () => window.clearInterval(id);
  }, [passportId]);

  const status =
    counter === 0 ? "Connecting…" : `Connected. Tick #${counter}`;

  return (
    <div
      data-testid="live-passport-view"
      data-passport-id={passportId}
      className="w-full rounded border border-white/10 bg-white/[0.03] p-4 text-sm"
    >
      <div className="flex items-center justify-between text-white/70">
        <span className="font-mono text-xs uppercase tracking-wide">
          live-passport-view
        </span>
        <span
          data-testid="live-passport-passport-id"
          className="font-mono text-xs text-white/50"
        >
          passportId: {passportId}
        </span>
      </div>
      <div
        data-testid="live-passport-status"
        className="mt-2 text-lg font-medium text-white"
      >
        {status}
      </div>
    </div>
  );
}

export const LIVE_PASSPORT_VIEW_TYPE = "live-passport-view";
