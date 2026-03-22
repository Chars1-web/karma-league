const LIVE_SCORING_URL = "/api/sheet?name=live-scoring";
const SCHEDULE_URL = "/api/sheet?name=schedule";
const els = {
  liveRow: document.getElementById("live-scoring"),
  liveModal: document.getElementById("live-modal"),
  liveDetails: document.getElementById("live-details"),
};
// ── Helpers ──────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], value = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { value += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) { row.push(value.trim()); value = ""; continue; }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(value.trim());
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = []; value = "";
      continue;
    }
    value += char;
  }
  if (value.length || row.length) { row.push(value.trim()); rows.push(row); }
  return rows;
}
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function normalizeTeamName(name) {
  return String(name || "")
    .replace(/\([^)]*\)/g, "").replace(/[:*]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ")
    .trim().toLowerCase();
}
function sliceRange(rows, range) {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) return [];
  const [, startCol, startRow, endCol, endRow] = match;
  const r1 = Number(startRow) - 1, r2 = Number(endRow) - 1;
  const c1 = startCol.toUpperCase().charCodeAt(0) - 65;
  const c2 = endCol.toUpperCase().charCodeAt(0) - 65;
  return rows.slice(r1, r2 + 1).map(row => row.slice(c1, c2 + 1));
}
// ── Core logic ────────────────────────────────────────────────────────────────
function extractLeagueDay(rows) {
  const row = rows.find(r =>
    String(r[0] || "").includes("League Day") ||
    String(r[1] || "").includes("League Day")
  );
  if (!row) return "";
  const cell = String(row[0] || row[1] || "");
  const parts = cell.split(":");
  return parts.length > 1 ? parts[1].trim() : cell.trim();
}
function parseLiveGames(rows) {
  const RANGES = [
    "A5:G11","A13:G19","A21:G27","A29:G35","A37:G43",
    "A45:G51","A53:G59","A61:G67","A69:G75","A77:G83",
    "A85:G91","A93:G99","A101:G107","A109:G115","A117:G122",
  ];
  const games = [];
  RANGES.forEach(range => {
    const block = sliceRange(rows, range);
    if (!block.length) return;
    let team1 = "", team2 = "", headerIndex = 0;
    for (let i = 0; i < block.length; i++) {
      const candidate = block[i] || [];
      const left = String(candidate[0] || "").trim();
      const right = String(candidate[4] || "").trim();
      if (left && right && !left.startsWith("@") && !right.startsWith("@") &&
          !left.includes("League Day") && !right.includes("League Day")) {
        team1 = left; team2 = right; headerIndex = i; break;
      }
    }
    if (!team1 || !team2) return;
    const players = block.slice(headerIndex + 1)
      .filter(row => String(row[0] || row[4] || "").trim() !== "");
    games.push({
      team1, team2,
      key: `${normalizeTeamName(team1)}|${normalizeTeamName(team2)}`,
      team1Players: players.map(r => ({ player: r[0]||"", points: r[1]||"", rank: r[2]||"" })),
      team2Players: players.map(r => ({ player: r[4]||"", points: r[5]||"", rank: r[6]||"" })),
    });
  });
  return games;
}
function getLiveScheduleIndexes(scheduleRows) {
  const headers = (scheduleRows[0] || []).map(h => String(h || "").trim().toLowerCase());
  const findIdx = checks => headers.findIndex(h => checks.some(c => h.includes(c)));
  let date = findIdx(["date"]);
  let team1 = findIdx(["team 1","team1","away"]);
  let team2 = findIdx(["team 2","team2","home"]);
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
function renderLiveScoring(liveRows, scheduleRows) {
  if (!liveRows.length) { els.liveRow.textContent = "No live scoring available."; return; }
  const leagueDay = extractLeagueDay(liveRows);
  const liveGames = parseLiveGames(liveRows);
  const liveMap = new Map(liveGames.map(g => [g.key, g]));
  const idx = getLiveScheduleIndexes(scheduleRows);
  const scheduleGames = scheduleRows.slice(1)
    .filter(row => String(row[idx.date] || "").trim() === leagueDay)
    .map((row, index) => {
      const team1 = String(row[idx.team1] || "").trim();
      const team2 = String(row[idx.team2] || "").trim();
      const key = `${normalizeTeamName(team1)}|${normalizeTeamName(team2)}`;
      const live = liveMap.get(key) || null;
      return {
        index, team1, team2,
        team1Players: live ? live.team1Players : [],
        team2Players: live ? live.team2Players : [],
      };
    });
  const games = scheduleGames.length ? scheduleGames : liveGames;
  if (!games.length) { els.liveRow.textContent = "No live games found for this day."; return; }
  els.liveRow.innerHTML = `
    <div class="live-list">
      ${games.map((game, index) => `
        <div class="live-row-item" data-index="${index}">
          <div class="live-matchup">
            <strong>${escapeHtml(game.team1)}</strong>
            <span>vs</span>
            <strong>${escapeHtml(game.team2)}</strong>
          </div>
        </div>
      `).join("")}
    </div>`;
  els.liveRow.onclick = event => {
    const rowEl = event.target.closest(".live-row-item");
    if (!rowEl) return;
    const game = games[Number(rowEl.dataset.index)];
    if (!game) return;
    const renderTeamTable = (players, header) => `
      <div class="boxscore-card">
        <div class="boxscore-team">${escapeHtml(header)}</div>
        <div class="boxscore-row"><span>Player</span><span>Points</span><span>Rank</span></div>
        ${players.filter(p => String(p.player || "").trim()).map(p => `
          <div class="boxscore-row">
            <span>${escapeHtml(p.player)}</span>
            <span>${escapeHtml(p.points)}</span>
            <span>${escapeHtml(p.rank)}</span>
          </div>`).join("") || '<div class="boxscore-empty">No stats available.</div>'}
      </div>`;
    els.liveDetails.innerHTML =
      renderTeamTable(game.team1Players, game.team1) +
      renderTeamTable(game.team2Players, game.team2);
    els.liveModal.hidden = false;
  };
}
// ── Close modal ───────────────────────────────────────────────────────────────
document.addEventListener("click", e => {
  if (e.target.matches("[data-close='true']")) els.liveModal.hidden = true;
});
// ── Fetch & boot ──────────────────────────────────────────────────────────────
async function fetchSheet(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const text = await response.text();
  const rows = parseCSV(text);
  if (!rows.length) throw new Error("No data found.");
  return rows;
}
async function loadData() {
  try {
    const [liveData, scheduleData] = await Promise.all([
      fetchSheet(LIVE_SCORING_URL),
      fetchSheet(SCHEDULE_URL),
    ]);
    renderLiveScoring(liveData, scheduleData);
  } catch (err) {
    els.liveRow.textContent = "Failed to load: " + err.message;
  }
}
loadData();