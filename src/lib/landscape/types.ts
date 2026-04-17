export type NodeType = "project" | "live_call";

export type EdgeType =
  | "shared_org"
  | "semantic"
  | "shared_topic"
  | "live_match";

export type LiveCallSource = "innovate_uk" | "horizon_europe" | "find_a_tender";

export type ProjectNode = {
  id: string;
  type: "project";
  title: string;
  x?: number;
  y?: number;
  score?: number;
  lead_funder?: string;
};

export type LiveCallNode = {
  id: string;
  type: "live_call";
  title: string;
  x?: number;
  y?: number;
  source?: LiveCallSource | string;
  status?: string;
  funder?: string;
  deadline?: string | null;
};

export type LandscapeNode = ProjectNode | LiveCallNode;

export type LandscapeLink = {
  source_id: string;
  target_id: string;
  edge_type: EdgeType;
  weight?: number;
};

export type LandscapeData = {
  generatedAt: string;
  nodes: LandscapeNode[];
  links: LandscapeLink[];
};
