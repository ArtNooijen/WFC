const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const DEFAULT_SETTINGS = {
  trackResources: true,
  trackAfflictions: true,
  safeRestRules: true,
};

export function outcomeSample(encounter, beforeParty, report) {
  const living = beforeParty.filter((member) => !member.dead);
  const maximumHp = living.reduce((sum, member) => sum + Number(member.maxHp), 0) || 1;
  const resourceMaximum =
    living.reduce((sum, member) => sum + Number(member.maxResource ?? 0), 0) || 1;
  const hpLoss = Object.values(report.members ?? {}).reduce(
    (sum, member) => sum + Number(member.hpLost ?? 0),
    0,
  );
  const resourcesSpent = Object.values(report.members ?? {}).reduce(
    (sum, member) => sum + Number(member.resourcesSpent ?? 0),
    0,
  );
  const downed = Object.values(report.members ?? {}).filter((member) => member.downed).length;
  const expected = { Low: .25, Moderate: .45, Hard: .65, Deadly: .85 }[encounter.rating] ?? .45;
  const feedback = { easier: -.1, accurate: 0, harder: .12 }[report.feedback] ?? 0;
  const actual = clamp(
    hpLoss / maximumHp * .55 + resourcesSpent / resourceMaximum * .22 +
      downed / Math.max(1, living.length) * .28 + Number(report.rounds ?? 3) / 10 * .1 + feedback,
    .08,
    1.2,
  );
  return {
    id: crypto.randomUUID(),
    encounterId: encounter.id,
    expected,
    actual,
    ratio: clamp(actual / expected, .55, 1.65),
    feedback: report.feedback,
    at: new Date().toISOString(),
  };
}

export function learningModel(samples = []) {
  const recent = samples.slice(-24);
  const priorWeight = 4;
  const weighted = recent.reduce((sum, sample, index) => {
    const recency = .65 + (index + 1) / Math.max(1, recent.length) * .35;
    return { sum: sum.sum + Number(sample.ratio) * recency, weight: sum.weight + recency };
  }, { sum: priorWeight, weight: priorWeight });
  const calibration = clamp(weighted.sum / weighted.weight, .72, 1.35);
  const confidence = clamp(recent.length / 12, 0, 1);
  return {
    calibration,
    samples: recent.length,
    confidence,
    label: calibration > 1.08
      ? "Party struggles above baseline"
      : calibration < .92
      ? "Party outperforms baseline"
      : "Party tracks the baseline",
  };
}

export function spendResources(member, amount) {
  let remaining = Math.max(0, Math.floor(Number(amount)));
  if (!member.resources?.length) {
    return { ...member, resource: Math.max(0, Number(member.resource) - remaining) };
  }
  const resources = member.resources.map((pool) => {
    const spent = Math.min(remaining, Number(pool.current));
    remaining -= spent;
    return { ...pool, current: Number(pool.current) - spent };
  });
  return {
    ...member,
    resources,
    resource: resources.reduce((sum, pool) => sum + Number(pool.current), 0),
  };
}
