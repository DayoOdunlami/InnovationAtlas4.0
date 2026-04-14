import type {
  LandscapeLiveCall,
  LandscapeProject,
} from "@/app/api/landscape/data/route";

export function inferThemeFromProject(p: LandscapeProject): string {
  const t = `${p.title ?? ""} ${p.abstract ?? ""}`.toLowerCase();
  if (t.includes("autonomy") || t.includes("autonomous")) return "autonomy";
  if (
    t.includes("decarbonisation") ||
    t.includes("decarbonization") ||
    t.includes("net-zero") ||
    t.includes("net zero") ||
    t.includes("decarbon")
  ) {
    return "decarbonisation";
  }
  if (t.includes("safety")) return "safety";
  if (
    t.includes("digital") ||
    t.includes("digitisation") ||
    t.includes("digitization")
  ) {
    return "digital";
  }
  if (t.includes("connectivity") || t.includes("connected")) {
    return "connectivity";
  }
  return "other";
}

export function inferThemeFromLive(c: LandscapeLiveCall): string {
  const t = `${c.title ?? ""} ${c.description ?? ""}`.toLowerCase();
  if (t.includes("autonomy") || t.includes("autonomous")) return "autonomy";
  if (
    t.includes("decarbonisation") ||
    t.includes("decarbonization") ||
    t.includes("net-zero") ||
    t.includes("net zero") ||
    t.includes("decarbon")
  ) {
    return "decarbonisation";
  }
  if (t.includes("safety")) return "safety";
  if (
    t.includes("digital") ||
    t.includes("digitisation") ||
    t.includes("digitization")
  ) {
    return "digital";
  }
  if (t.includes("connectivity") || t.includes("connected")) {
    return "connectivity";
  }
  return "other";
}
