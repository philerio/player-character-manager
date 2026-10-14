import {
  rollTerritoryRecruitment,
  completeTerritoryRecruitment,
  denyTerritoryRecruitment,
  resetTerritoryRecruitment,
  startSettlementFieldExpansion,
  startFarmlandDevelopment,
} from "../google-sheets-api";

/** Inject this service into territory screens to preview or replace data access. */
export const territoryActions = {
  rollTerritoryRecruitment,
  completeTerritoryRecruitment,
  denyTerritoryRecruitment,
  resetTerritoryRecruitment,
  startSettlementFieldExpansion,
  startFarmlandDevelopment,
};
export type TerritoryActions = typeof territoryActions;
