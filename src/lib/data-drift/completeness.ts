/**
 * Nurse profiles whose STORED completeness score disagrees with what the
 * profile actually earns (#727).
 *
 * The stored score is what search ranks on. It was written only when a nurse
 * saved the main profile form, so any other write that touched a scored field
 * left it behind. Measured against production on 2026-09-03: 67 of 134
 * profiles were scored below what they earn, some by 90 points.
 *
 * The decision and the read live here rather than in the script that found it,
 * because the weekly cron that watches for it (#927) has to ask the same
 * question. Two copies of "which rows have drifted" would be two answers, and
 * the monitor could then reassure somebody about a rule the repair does not
 * use.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyListedNurseFilter } from "@/lib/nurses/visibility";
import {
  calculateCompleteness,
  COMPLETENESS_COLUMNS,
  type CompletenessInput,
} from "@/lib/profile/completeness";

export interface DriftRow {
  user_id: string;
  stored: number;
  derived: number;
}

export type ScoredRow = CompletenessInput & {
  user_id: string;
  profile_completeness: number;
};

/** The rows whose stored score is not what their profile earns. */
export function rowsNeedingRepair(rows: ScoredRow[]): DriftRow[] {
  const out: DriftRow[] = [];
  for (const row of rows) {
    const { score } = calculateCompleteness(row);
    if (score !== row.profile_completeness) {
      out.push({
        user_id: row.user_id,
        stored: row.profile_completeness,
        derived: score,
      });
    }
  }
  return out;
}

/**
 * Both directions, counted separately. A score that is too HIGH is a nurse
 * ranked on credit she does not have, which is a different and worse thing
 * than one ranked too low, and folding them into one number would hide it.
 */
export function summarise(drift: DriftRow[]): string {
  if (drift.length === 0)
    return "No drift: every stored score is what the profile earns.";

  const low = drift.filter((d) => d.derived > d.stored);
  const high = drift.filter((d) => d.derived < d.stored);
  const gaps = low.map((d) => d.derived - d.stored).sort((a, b) => a - b);

  const lines = [
    `${low.length} scored below what the profile earns` +
      (gaps.length
        ? ` (by ${gaps[0]} to ${gaps[gaps.length - 1]} points)`
        : ""),
    `${high.length} scored above what the profile earns`,
  ];
  return lines.join("\n");
}

/**
 * How many rows the server says there are, from a PostgREST content-range
 * header, or null when it does not say or says something we cannot read.
 *
 * Returned as null rather than a number, and mapped to a refusal by the
 * caller, because a value parsed straight into a comparison lands on the
 * permissive side when the parse fails: NaN compares unequal to everything,
 * and "*" or a missing header would otherwise become 0 and make an empty read
 * look complete. readAllZips reads through it; readScoredProfiles below takes
 * the count from the client instead.
 */
export function parseReportedTotal(contentRange: string | null): number | null {
  const total = contentRange?.split("/")[1];
  if (!total || total === "*") return null;
  const parsed = Number(total);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Every nurse the directory lists, with her scored fields, paged, and only
 * when the whole roster arrived.
 *
 * ONLY THE LISTED ONES. The stored score is read in one place, ordering the
 * directory, so a nurse it does not list is ranked against nobody and a score
 * on her that disagrees with the rule affects nobody. Judging every profile
 * sent the weekly alert to a person for nurses who had simply not finished
 * signing up (2026-09-14), which is expected and needs nobody. The population
 * comes from applyListedNurseFilter itself, so this check and the directory
 * cannot come to disagree about who is in it.
 *
 * PostgREST caps a select at a page and returns a healthy looking prefix, so
 * an unbounded read would judge the first page and silently ignore the rest.
 * A short page ends the loop, which is also exactly what a truncated read
 * looks like, so the total is checked against the count the server reports: a
 * monitor that quietly covered half the roster would report a clean result and
 * leave the other half wrong, which is the failure it exists to find. The
 * order is fixed so a row cannot move between pages and be read twice or not
 * at all.
 *
 * The client is an argument: the part that decides whether the list is
 * complete is the part most worth testing, and a function that builds its own
 * client cannot be.
 */
export async function readScoredProfiles(deps: {
  client: SupabaseClient;
  pageSize?: number;
}): Promise<ScoredRow[]> {
  const pageSize = deps.pageSize ?? 500;
  const rows: ScoredRow[] = [];
  let reportedTotal: number | null = null;

  for (let from = 0; ; from += pageSize) {
    // Inner, because the owner conditions the listing rule applies live on
    // the users row; a left embed would count a deleted or suspended owner.
    const query = applyListedNurseFilter(
      deps.client
        .from("nurse_profiles")
        .select(
          `user_id, profile_completeness, ${COMPLETENESS_COLUMNS}, users!inner(is_deleted, is_suspended)`,
          { count: "exact" },
        ),
    );
    const { data, error, count } = await query
      .order("user_id")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Read failed: ${error.message}`);
    // A read that succeeded without a count, or without rows, is an absence of
    // measurement, and treating either as zero would read as a real answer.
    if (count === null || count === undefined) {
      throw new Error(
        "The server did not report how many profiles there are, so a short read could not be told from a complete one.",
      );
    }
    if (!data) {
      throw new Error("The read succeeded but returned no rows at all.");
    }
    reportedTotal ??= count;
    const page = data as unknown as ScoredRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  if (reportedTotal === null) {
    throw new Error(
      "The server did not report how many profiles there are, so a short read could not be told from a complete one.",
    );
  }
  if (rows.length !== reportedTotal) {
    throw new Error(
      `Read ${rows.length} profiles but the server reports ${reportedTotal}. Refusing to judge a partial roster.`,
    );
  }
  return rows;
}
