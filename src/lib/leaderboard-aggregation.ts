export function aggregateLeaderboardViews(
  contributions,
  sourceTotals = new Map()
) {
  const groups = [];

  for (const contribution of contributions) {
    if (!contribution.username || contribution.blocksMined <= 0 || !contribution.sourceKey) {
      continue;
    }

    const { usernameLower, stableAliases, usernameAlias } = buildAliases(contribution);
    const matched = [];

    for (const group of groups) {
      const stableMatch = stableAliases.some((alias) => group.aliases.has(alias));
      const usernameMatch =
        stableAliases.length === 0 &&
        usernameAlias &&
        group.hasStableIdentity === false &&
        group.aliases.has(usernameAlias);

      if (stableMatch || usernameMatch) {
        matched.push(group);
      }
    }

    const group =
      matched[0] ??
      {
        username: contribution.username,
        usernameLower,
        playerId: contribution.playerId ?? null,
        internalUserId: contribution.internalUserId ?? null,
        minecraftUuidHash: contribution.minecraftUuidHash ?? null,
        aliases: new Set(),
        hasStableIdentity: stableAliases.length > 0,
        perSource: new Map(),
      };

    if (matched.length === 0) {
      groups.push(group);
    } else if (matched.length > 1) {
      for (const duplicate of matched.slice(1)) {
        mergeGroups(group, duplicate);
        groups.splice(groups.indexOf(duplicate), 1);
      }
    }

    group.username = chooseBetterUsername(group.username, contribution.username);
    group.usernameLower = group.usernameLower || usernameLower;
    group.playerId = group.playerId ?? contribution.playerId ?? null;
    group.internalUserId = group.internalUserId ?? contribution.internalUserId ?? null;
    group.minecraftUuidHash = group.minecraftUuidHash ?? contribution.minecraftUuidHash ?? null;
    group.hasStableIdentity = group.hasStableIdentity || stableAliases.length > 0;

    for (const alias of stableAliases) {
      group.aliases.add(alias);
    }
    if (stableAliases.length === 0 && usernameAlias) {
      group.aliases.add(usernameAlias);
    }

    const existing = group.perSource.get(contribution.sourceKey);

    if (
      !existing ||
      contribution.blocksMined > existing.blocksMined ||
      (contribution.blocksMined === existing.blocksMined &&
        toTimestamp(contribution.lastUpdated) > toTimestamp(existing.lastUpdated))
    ) {
      group.perSource.set(contribution.sourceKey, {
        sourceKey: contribution.sourceKey,
        sourceLabel: contribution.sourceLabel,
        // 🔥 FORCE uniform behavior
        sourceKind: "world",
        blocksMined: contribution.blocksMined,
        lastUpdated: contribution.lastUpdated,
        includeSourceView: contribution.includeSourceView !== false,
      });
    }
  }

  const sourceViews = new Map();

  // ✅ GLOBAL = sum of ALL sources
  const globalRowsBase = groups
    .map((group) => {
      const perSource = Array.from(group.perSource.values());

      const blocksMined = perSource.reduce((sum, s) => sum + s.blocksMined, 0);

      const lastUpdated =
        perSource
          .map((s) => s.lastUpdated)
          .sort((a, b) => toTimestamp(b) - toTimestamp(a))[0] ??
        new Date(0).toISOString();

      return {
        playerId: group.playerId,
        username: group.username,
        usernameLower: group.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(group.username)}/48`,
        lastUpdated,
        blocksMined,
        totalDigs: blocksMined,
        sourceServer: `${perSource.length} ${perSource.length === 1 ? "place" : "places"}`,
        sourceKey: "global",
        sourceCount: perSource.length,
        viewKind: "global",
      };
    })
    .filter((row) => row.blocksMined > 0)
    .sort(
      (a, b) =>
        b.blocksMined - a.blocksMined ||
        toTimestamp(b.lastUpdated) - toTimestamp(a.lastUpdated) ||
        a.username.localeCompare(b.username)
    );

  // ✅ SOURCE = ONLY that source
  for (const group of groups) {
    for (const contribution of group.perSource.values()) {
      if (!contribution.includeSourceView) continue;

      const view =
        sourceViews.get(contribution.sourceKey) ?? {
          key: contribution.sourceKey,
          label: contribution.sourceLabel,
          description: `Totals from ${contribution.sourceLabel}.`,
          kind: "source",
          playerCount: 0,
          totalBlocks: 0,
          rows: [],
        };

      view.rows.push({
        playerId: group.playerId,
        username: group.username,
        usernameLower: group.usernameLower,
        skinFaceUrl: `https://minotar.net/avatar/${encodeURIComponent(group.username)}/48`,
        lastUpdated: contribution.lastUpdated,
        blocksMined: contribution.blocksMined,
        totalDigs: contribution.blocksMined,
        rank: 0,
        sourceServer: contribution.sourceLabel,
        sourceKey: contribution.sourceKey,
        sourceCount: 1,
        viewKind: "source",
      });

      sourceViews.set(contribution.sourceKey, view);
    }
  }

  const globalView = {
    key: "global",
    label: "Main Leaderboard",
    description: "Totals across every approved server and world.",
    kind: "global",
    playerCount: globalRowsBase.length,
    totalBlocks: globalRowsBase.reduce((sum, row) => sum + row.blocksMined, 0),
    rows: assignRanks(globalRowsBase),
  };

  const orderedSourceViews = Array.from(sourceViews.values())
    .map((view) => {
      const sortedRows = view.rows.sort(
        (a, b) =>
          b.blocksMined - a.blocksMined ||
          toTimestamp(b.lastUpdated) - toTimestamp(a.lastUpdated) ||
          a.username.localeCompare(b.username)
      );

      const override = sourceTotals.get(view.key);

      return {
        ...view,
        playerCount: sortedRows.length,
        totalBlocks:
          override?.totalBlocks ??
          sortedRows.reduce((sum, row) => sum + row.blocksMined, 0),
        rows: assignRanks(sortedRows),
      };
    })
    // 🔥 FIX: NO AETERNUM PRIORITY
    .sort(
      (a, b) =>
        b.totalBlocks - a.totalBlocks ||
        a.label.localeCompare(b.label)
    );

  return [globalView, ...orderedSourceViews];
}
