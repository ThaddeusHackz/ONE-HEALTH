/** Parametric reporting-delay nowcast.
 *  We do not have vintage (as-of) DHIMS2 tables, so this uses a published-style
 *  completeness curve: the most recent weeks are treated as incomplete.
 *  It is a nowcast, not the truth.
 */

export interface NowcastWeek {
  date: string;
  observed: number;
  completeness: number;
  nowcast: number;
  low: number;
  high: number;
  lag: number;
}

export interface NowcastResult {
  method: string;
  lagWeeks: number;
  current: NowcastWeek;
  weeks: NowcastWeek[];
  caveat: string;
}

const DEFAULT_P = [0.55, 0.78, 0.91, 0.97, 1];

export function reportingNowcast(
  points: { date: string; cases: number }[],
  lagWeeks = 3,
): NowcastResult {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const weeks: NowcastWeek[] = sorted.map((p, i) => {
    const lag = n - 1 - i;
    const pComplete = lag >= DEFAULT_P.length - 1 ? 1 : DEFAULT_P[Math.min(lag, DEFAULT_P.length - 1)];
    const completeness = lag > lagWeeks ? 1 : pComplete;
    const nowcast = completeness > 0 ? p.cases / completeness : p.cases;
    const band = 0.28 * (1 - completeness);
    return {
      date: p.date,
      observed: p.cases,
      completeness: Number(completeness.toFixed(2)),
      nowcast: Number(nowcast.toFixed(1)),
      low: Number(Math.max(0, nowcast * (1 - band)).toFixed(1)),
      high: Number((nowcast * (1 + band * 1.4)).toFixed(1)),
      lag,
    };
  });
  const current = weeks[weeks.length - 1] || {
    date: "",
    observed: 0,
    completeness: 1,
    nowcast: 0,
    low: 0,
    high: 0,
    lag: 0,
  };
  return {
    method: "parametric-reporting-delay (no vintage table)",
    lagWeeks,
    current,
    weeks: weeks.slice(-8),
    caveat:
      "Last weeks are treated as incomplete reports, not as a true drop in disease. Replace this curve with your DHIMS2 as-of extracts when the national team can share them. A nowcast is still an interval.",
  };
}
