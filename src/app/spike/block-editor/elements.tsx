"use client";

import { type PlateElementProps, PlateElement } from "platejs/react";

export function ParagraphElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="p"
      className="my-2 text-base leading-7 text-white/90"
      {...props}
    />
  );
}

export function H1Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h1"
      className="mt-4 mb-2 text-3xl font-bold text-white"
      {...props}
    />
  );
}

export function H2Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h2"
      className="mt-4 mb-2 text-2xl font-semibold text-white"
      {...props}
    />
  );
}

export function H3Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h3"
      className="mt-3 mb-2 text-xl font-semibold text-white"
      {...props}
    />
  );
}
