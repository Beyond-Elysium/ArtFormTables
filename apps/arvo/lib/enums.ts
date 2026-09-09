import { z } from "zod";

export const objectiveSchema = z.enum([
  "awareness",
  "consideration",
  "lead_generation",
  "recruitment",
]);

export type Objective = z.infer<typeof objectiveSchema>;

export const objectiveLabels: Record<Objective, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  lead_generation: "Lead Generation",
  recruitment: "Recruitment",
};

export const sectorSchema = z.enum(["dod", "ic", "civilian", "sled", "higher_ed"]);

export type Sector = z.infer<typeof sectorSchema>;

export const sectorLabels: Record<Sector, string> = {
  dod: "DoD",
  ic: "Intelligence Community",
  civilian: "Civilian",
  sled: "SLED",
  higher_ed: "Higher Ed",
};
