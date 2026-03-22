const LIVE_SCORING_URL = "/api/sheet?name=live-scoring";
function extractLeagueDay(rows) {
  const row = rows.find(
    (r) =>
      String(r[0] || "").includes("League Day") ||
      String(r[1] || "").includes("League Day")
  );
  if (!row) return "";
  const cell = String(row[0] || row[1] || "");
  const parts = cell.split(":");
  return parts.length > 1 ? parts[1].trim() : cell.trim();
}
function parseLiveGames(rows) {
  const LIVE_GAME_RANGES = [
    { range: "A5:G11", format: "standard" },
    { range: "A13:G19", format: "standard" },
    { range: "A21:G27", format: "standard" },
    { range: "A29:G35", format: "standard" },
    { range: "A37:G43", format: "standard" },
    { range: "A45:G51", format: "standard" },
    { range: "A53:G59", format: "standard" },
    { range: "A61:G67", format: "standard" },
    { range: "A69:G75", format: "standard" },
    { range: "A77:G83", format: "standard" },
    { range: "A85:G91", format: "standard" },
    { range: "A93:G99", format: "standard" },
    { range: "A101:G107", format: "standard" },
    { range: "A109:G115", format: "standard" },
    { range: "A117:G122", format: "standard" },
  ];
  const games = [];
  LIVE_GAME_RANGES.forEach(({ range, format }) => {
    const block = sliceRange(rows, range);
    if (!block.length) return;
    let team1 = "";
    let team2 = "";
    let headerIndex = 0;
    if (format === "compact") {
      const header = block[0] || [];
      const headerA = String(header[0] || "").trim();
      const headerD = String(header[3] || "").trim();
      const combinedHeader = [headerA, headerD].filter(Boolean).join(" ");
      const vsMatch = combinedHeader.match(/(.+?)\s+vs\s+(.+)/i);
      if (vsMatch) {
        team1 = String(vsMatch[1] || "").trim();
        team2 = String(vsMatch[2] || "").trim();
      } else {
        team1 = headerA;
        team2 = headerD;
      }
      if (team1.startsWith("@") || team2.startsWith("@")) {
        team1 = "";
        team2 = "";
      }
    } else {
      let header = block[0] || [];
      for (let i = 0; i < block.length; i += 1) {
        const candidate = block[i] || [];
        const left = String(candidate[0] || "").trim();
        const right = String(candidate[4] || "").trim();
        const looksHeader =
          left &&
          right &&
          !left.startsWith("@") &&
          !right.startsWith("@") &&
          !left.includes("League Day") &&
          !right.includes("League Day");
        if (looksHeader) {
          header = candidate;
          headerIndex = i;
          break;
        }
      }
      team1 = String(header[0] || "").trim();
      team2 = String(header[4] || "").trim();
    }
    if (!team1 || !team2) return;
    let players = [];
    let team1Players = [];
    let team2Players = [];
    if (format === "compact") {
      const firstRow = block[0] || [];
      const firstRowLooksPlayer =
        String(firstRow[0] || "").trim().startsWith("@") ||
        String(firstRow[3] || "").trim().startsWith("@");
      const sourceRows = firstRowLooksPlayer ? block : block.slice(1);
      const lines = sourceRows.filter((row) => {
        const left = String(row[0] || "").trim();
        const right = String(row[3] || "").trim();
        return !!left || !!right;
      });
      team1Players = lines.map((row) => ({
        player: row[0] || "",
        points: row[1] || "",
        rank: row[2] || "",
      }));
      team2Players = lines.map((row) => ({
        player: row[3] || "",
        points: "",
        rank: "",
      }));
      players = lines;
    } else {
      players = block
        .slice(headerIndex + 1)
        .filter((row) => String(row[0] || row[4] || "").trim() !== "");
      team1Players = players.map((row) => ({
        player: row[0] || "",
        points: row[1] || "",
        rank: row[2] || "",
      }));
      team2Players = players.map((row) => ({
        player: row[4] || "",
        points: row[5] || "",
        rank: row[6] || "",
      }));
    }
    games.push({
      team1,
      team2,
      key: `${normalizeTeamName(team1)}|${normalizeTeamName(team2)}`,
      players,
      team1Players,
      team2Players,
    });
  });
  return games;
}
function getLiveScheduleIndexes(scheduleRows) {
  const headers = (scheduleRows[0] || []).map((h) =>
    String(h || "").trim().toLowerCase()
  );
  const findIdx = (checks) =>
    headers.findIndex((h) => checks.some((check) => h.includes(check)));
  let date = findIdx(["date"]);
  let team1 = findIdx(["team 1", "team1", "away"]);
  let team2 = findIdx(["team 2", "team2", "home"]);
  if (team1 === -1 || team2 === -1) {
    if ((scheduleRows[0] || []).length >= 4) {
      if (date === -1) date = 1;
      if (team1 === -1) team1 = 2;
      if (team2 === -1) team2 = 3;
    } else {
      if (date === -1) date = 0;
      if (team1 === -1) team1 = 1;
      if (team2 === -1) team2 = 2;
    }
  }
  return { date, team1, team2 };
}
function renderLiveScoring(rows, scheduleRows) {
  if (!rows.length) {
    els.liveRow.textContent = "No live scoring available.";
    return;
  }
  const leagueDay = extractLeagueDay(rows);
  const liveGames = parseLiveGames(rows);
  const liveMap = new Map(liveGames.map((g) => [g.key, g]));
  const scheduleIdx = getLiveScheduleIndexes(scheduleRows);
  const scheduleGames = scheduleRows
    .slice(1)
    .filter((row) => String(row[scheduleIdx.date] || "").trim() === leagueDay)
    .map((row, index) => {
      const team1 = String(row[scheduleIdx.team1] || "").trim();
      const team2 = String(row[scheduleIdx.team2] || "").trim();
      const key = `${normalizeTeamName(team1)}|${normalizeTeamName(team2)}`;
      const live = liveMap.get(key) || null;
      return {
        index,
        team1,
        team2,
        players: live ? live.players : [],
        team1Players: live ? live.team1Players : [],
        team2Players: live ? live.team2Players : [],
      };
    });
  const games = scheduleGames.length ? scheduleGames : liveGames;
  if (!games.length) {
    els.liveRow.textContent = "No live games found for this day.";
    return;
  }
  // Render matchup cards
  els.liveRow.innerHTML = `
    <div class="live-list">
      ${games
        .map(
          (game, index) => `
            <div class="live-row-item" data-index="${index}">
              <div class="live-matchup">
                <strong>${escapeHtml(game.team1)}</strong>
                <span>vs</span>
                <strong>${escapeHtml(game.team2)}</strong>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
  // Click card => open box score modal
  els.liveRow.onclick = (event) => {
    const rowEl = event.target.closest(".live-row-item");
    if (!rowEl) return;
    const idx = Number(rowEl.dataset.index);
    const game = games[idx];
    if (!game) return;
    const team1Players = (game.team1Players || []).length
      ? game.team1Players
      : (game.players || []).map((r) => ({
          player: r[0] || "",
          points: r[1] || "",
          rank: r[2] || "",
        }));
    const team2Players = (game.team2Players || []).length
      ? game.team2Players
      : (game.players || []).map((r) => ({
          player: r[4] || "",
          points: r[5] || "",
          rank: r[6] || "",
        }));
    const renderTeamTable = (rowsList, header) => `
      <div class="boxscore-card">
        <div class="boxscore-team">${escapeHtml(header)}</div>
        <div class="boxscore-row"><span>Player</span><span>Points</span><span>Rank</span></div>
        ${
          rowsList
            .filter((p) => String(p.player || "").trim())
            .map(
              (p) => `
                <div class="boxscore-row">
                  <span>${escapeHtml(p.player)}</span>
                  <span>${escapeHtml(p.points)}</span>
                  <span>${escapeHtml(p.rank)}</span>
                </div>
              `
            )
            .join("") || '<div class="boxscore-empty">No stats available.</div>'
        }
      </div>
    `;
    els.liveDetails.innerHTML = `
      ${renderTeamTable(team1Players, game.team1)}
      ${renderTeamTable(team2Players, game.team2)}
    `;
    els.liveModal.hidden = false;
  };
}
async function fetchSheet(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const text = await response.text();
  const rows = parseCSV(text);
  if (!rows.length) throw new Error("No data found.");
  return rows;
}
async function loadData() {
  const [liveData, scheduleData] = await Promise.all([
    fetchSheet(LIVE_SCORING_URL),
    fetchSheet("/api/sheet?name=schedule"),
  ]);
  renderLiveScoring(liveData, scheduleData);
}