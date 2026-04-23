// ---------------------------------------------------------------------------
// Preset query pills (plan §5, §9).
//
// These six queries each produce a well-populated gravity-search result
// against the real Atlas corpus. They are **demo affordances only**;
// users type free-text in the header input when they want something
// else. The POC uses a different demo list (`rail hydrogen
// decarbonisation`, `autonomous ships port operations`, `sustainable
// aviation fuel SAF`, `electric vehicle charging`) — we keep BOTH sets
// available via the `POC_PRESETS` + `PRESET_QUERIES` exports so the
// control surface can swap them without a code change.
// ---------------------------------------------------------------------------

export type PresetQuery = {
  id: string;
  label: string;
  query: string;
};

export const PRESET_QUERIES: PresetQuery[] = [
  {
    id: "hydrogen",
    label: "hydrogen fuel cell vehicles",
    query: "hydrogen fuel cell vehicles",
  },
  {
    id: "autonomy",
    label: "autonomous vehicles and connected mobility",
    query: "autonomous vehicles and connected mobility",
  },
  {
    id: "rail-decarb",
    label: "rail decarbonisation and traction energy",
    query: "rail decarbonisation and traction energy",
  },
  {
    id: "uas",
    label: "unmanned aerial systems and drone corridors",
    query: "unmanned aerial systems and drone corridors",
  },
  {
    id: "smart-cities",
    label: "smart cities digital twins urban mobility",
    query: "smart cities digital twins urban mobility",
  },
  {
    id: "active-travel",
    label: "active travel cycling walking infrastructure",
    query: "active travel cycling walking infrastructure",
  },
];

export const POC_PRESETS: PresetQuery[] = [
  {
    id: "poc-rail",
    label: "rail hydrogen decarbonisation",
    query: "rail hydrogen decarbonisation",
  },
  {
    id: "poc-port",
    label: "autonomous ships port operations",
    query: "autonomous ships port operations",
  },
  {
    id: "poc-saf",
    label: "sustainable aviation fuel",
    query: "sustainable aviation fuel SAF",
  },
  {
    id: "poc-ev",
    label: "EV charging infrastructure",
    query: "electric vehicle charging",
  },
];
