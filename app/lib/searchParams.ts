/**
 * Shared nuqs parsers for the dashboard's URL state. Used by both the client
 * controls (useQueryStates) and the server page (createSearchParamsCache), so
 * the URL contract is defined in exactly one place and is fully typed.
 */
import { parseAsString, parseAsStringLiteral } from "nuqs/server";
import {
  RANGE_PRESETS,
  COMPARE_OPTIONS,
  type RangePresetId,
  type CompareMode,
} from "./range";

const PRESET_IDS = RANGE_PRESETS.map((p) => p.id) as [RangePresetId, ...RangePresetId[]];
const COMPARE_IDS = COMPARE_OPTIONS.map((c) => c.id) as [CompareMode, ...CompareMode[]];

export const dashboardParsers = {
  range: parseAsStringLiteral(PRESET_IDS).withDefault("28d"),
  from: parseAsString,
  to: parseAsString,
  compare: parseAsStringLiteral(COMPARE_IDS).withDefault("none"),
};
