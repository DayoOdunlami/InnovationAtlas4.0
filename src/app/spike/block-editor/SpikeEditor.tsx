"use client";

import {
  H1Plugin,
  H2Plugin,
  H3Plugin,
} from "@platejs/basic-nodes/react";
import type { Value } from "platejs";
import {
  Plate,
  PlateContent,
  usePlateEditor,
  createPlatePlugin,
} from "platejs/react";
import { useCallback, useMemo, useState } from "react";

import {
  H1Element,
  H2Element,
  H3Element,
  ParagraphElement,
} from "./elements";
import {
  LandscapeEmbedElement,
  LANDSCAPE_EMBED_TYPE,
} from "./landscape-embed-element";
import {
  LivePassportViewElement,
  LIVE_PASSPORT_VIEW_TYPE,
} from "./live-passport-view-element";

const PASSPORT_IDS = ["p-001", "p-002", "p-003"] as const;

type PassportId = (typeof PASSPORT_IDS)[number];

const makeInitialValue = (passportId: PassportId): Value => [
  { type: "h1", children: [{ text: "Plate Spike Harness" }] },
  {
    type: "p",
    children: [
      {
        text: "This is an editable paragraph. Try clicking a node in the 3D block below.",
      },
    ],
  },
  {
    type: LANDSCAPE_EMBED_TYPE,
    children: [{ text: "" }],
  },
  {
    type: "p",
    children: [{ text: "Paragraph between the two custom blocks." }],
  },
  {
    type: LIVE_PASSPORT_VIEW_TYPE,
    passportId,
    children: [{ text: "" }],
  },
  {
    type: "p",
    children: [{ text: "Final paragraph." }],
  },
];

const LandscapeEmbedPlugin = createPlatePlugin({
  key: LANDSCAPE_EMBED_TYPE,
  node: {
    isElement: true,
    isVoid: true,
    type: LANDSCAPE_EMBED_TYPE,
    component: LandscapeEmbedElement,
  },
});

const LivePassportViewPlugin = createPlatePlugin({
  key: LIVE_PASSPORT_VIEW_TYPE,
  node: {
    isElement: true,
    isVoid: true,
    type: LIVE_PASSPORT_VIEW_TYPE,
    component: LivePassportViewElement,
  },
});

export function SpikeEditor() {
  const [passportIndex, setPassportIndex] = useState(0);
  const currentPassport = PASSPORT_IDS[passportIndex];

  const plugins = useMemo(
    () => [
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      LandscapeEmbedPlugin,
      LivePassportViewPlugin,
    ],
    [],
  );

  const editor = usePlateEditor({
    plugins,
    components: {
      p: ParagraphElement,
    },
    value: makeInitialValue(currentPassport),
  });

  const [editorValue, setEditorValue] = useState<Value>(() =>
    makeInitialValue(currentPassport),
  );

  const cyclePassport = useCallback(() => {
    const next = (passportIndex + 1) % PASSPORT_IDS.length;
    setPassportIndex(next);
    const nextId = PASSPORT_IDS[next];
    const currentValue = editor.children as Value;
    const newValue: Value = currentValue.map((node) => {
      const n = node as { type?: string };
      if (n.type === LIVE_PASSPORT_VIEW_TYPE) {
        return { ...node, passportId: nextId };
      }
      return node;
    });
    editor.tf.setValue(newValue);
  }, [editor, passportIndex]);

  const removeByType = useCallback(
    (type: string) => {
      const currentValue = editor.children as Value;
      const newValue = currentValue.filter(
        (node) => (node as { type?: string }).type !== type,
      );
      editor.tf.setValue(newValue);
    },
    [editor],
  );

  const reAddBoth = useCallback(() => {
    const currentValue = editor.children as Value;
    const hasLandscape = currentValue.some(
      (n) => (n as { type?: string }).type === LANDSCAPE_EMBED_TYPE,
    );
    const hasPassport = currentValue.some(
      (n) => (n as { type?: string }).type === LIVE_PASSPORT_VIEW_TYPE,
    );
    const newValue: Value = [...currentValue];
    if (!hasLandscape) {
      newValue.push({
        type: LANDSCAPE_EMBED_TYPE,
        children: [{ text: "" }],
      });
    }
    if (!hasPassport) {
      newValue.push({
        type: LIVE_PASSPORT_VIEW_TYPE,
        passportId: currentPassport,
        children: [{ text: "" }],
      });
    }
    editor.tf.setValue(newValue);
  }, [editor, currentPassport]);

  return (
    <div className="min-h-screen bg-[#0a0d16] text-white p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">
            /spike/block-editor — Plate harness
          </h1>
          <p className="text-sm text-white/60">
            Six blocks: heading, paragraph, landscape-embed, paragraph,
            live-passport-view, paragraph.
          </p>
        </header>
        <div className="flex flex-wrap gap-2" data-testid="spike-harness-chrome">
          <button
            type="button"
            data-testid="btn-cycle-passport"
            onClick={cyclePassport}
            className="rounded bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-sm font-medium"
          >
            Cycle passport id (current: {currentPassport})
          </button>
          <button
            type="button"
            data-testid="btn-remove-landscape"
            onClick={() => removeByType(LANDSCAPE_EMBED_TYPE)}
            className="rounded bg-rose-700 hover:bg-rose-600 px-3 py-1.5 text-sm font-medium"
          >
            Remove landscape-embed block
          </button>
          <button
            type="button"
            data-testid="btn-remove-passport"
            onClick={() => removeByType(LIVE_PASSPORT_VIEW_TYPE)}
            className="rounded bg-rose-700 hover:bg-rose-600 px-3 py-1.5 text-sm font-medium"
          >
            Remove live-passport-view block
          </button>
          <button
            type="button"
            data-testid="btn-readd-both"
            onClick={reAddBoth}
            className="rounded bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 text-sm font-medium"
          >
            Re-add both blocks
          </button>
        </div>

        <Plate
          editor={editor}
          onChange={({ value }) => {
            setEditorValue(value);
          }}
        >
          <div
            data-testid="spike-editor-container"
            className="rounded-lg border border-white/10 bg-black/30 p-4"
          >
            <PlateContent
              data-testid="spike-editor-content"
              className="outline-none min-h-[200px]"
              placeholder="Type here…"
            />
          </div>
        </Plate>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white/70">
            Editor value (JSON)
          </h2>
          <pre
            data-testid="spike-editor-value"
            className="max-h-[360px] overflow-auto rounded border border-white/10 bg-black/50 p-3 text-xs text-white/80"
          >
            {JSON.stringify(editorValue, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
