"use client";

// ---------------------------------------------------------------------------
// Plate element components for the three text block types (Phase 2a.1).
//
// Each element is registered as a Plate plugin node. The editor mounts
// these components for `type: "h1" | "h2" | "h3" | "p" | "ul" | "ol"`.
// Rendering semantics match the read-only RSC renderers so that the
// edit ↔ read hand-off is visually stable (same heading sizes, same
// paragraph leading, same list indent).
//
// These are deliberately thin wrappers on `PlateElement`; the heavy
// lifting (serialisation, optimistic commits) lives in the editor host.
// ---------------------------------------------------------------------------

import { PlateElement, type PlateElementProps } from "platejs/react";

export function H1Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h1"
      className="mt-3 mb-1 text-2xl font-semibold text-foreground outline-none"
      {...props}
    />
  );
}

export function H2Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h2"
      className="mt-3 mb-1 text-xl font-semibold text-foreground outline-none"
      {...props}
    />
  );
}

export function H3Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h3"
      className="mt-2 mb-1 text-lg font-semibold text-foreground outline-none"
      {...props}
    />
  );
}

export function ParagraphElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="p"
      className="my-1.5 text-base leading-relaxed text-foreground outline-none"
      {...props}
    />
  );
}

export function BulletsUlElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="ul"
      className="my-1 list-disc pl-6 text-foreground outline-none"
      {...props}
    />
  );
}

export function BulletsOlElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="ol"
      className="my-1 list-decimal pl-6 text-foreground outline-none"
      {...props}
    />
  );
}

export function ListItemElement(props: PlateElementProps) {
  const indent = (props.element as unknown as { indent?: number }).indent ?? 0;
  const style =
    indent === 2
      ? { marginLeft: "3rem" }
      : indent === 1
        ? { marginLeft: "1.5rem" }
        : undefined;
  return <PlateElement as="li" style={style} {...props} />;
}

export function LinkElement(props: PlateElementProps) {
  const href = (props.element as unknown as { url?: string }).url ?? "#";
  return (
    <PlateElement
      as="a"
      {...props}
      attributes={{
        ...props.attributes,
        href,
        target: "_blank",
        rel: "noopener noreferrer",
      }}
      className="underline text-primary"
    />
  );
}
