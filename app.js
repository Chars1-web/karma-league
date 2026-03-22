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
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function normalizeTeamName(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, '')  // strip (score) before normalizing
    .replace(/[:*]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ')
    .trim().toLowerCase();
}
function colToIndex(letter) {
  return letter.toUpperCase().charCodeAt(0) - 65;
}
function sliceRange(rows, range) {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) return [];
  const startCol = colToIndex(match[1]), endCol = colToIndex(match[3]);
  const startRow = Number(match[2]) - 1, endRow = Number(match[4]) - 1;
  return rows.slice(startRow, endRow + 1).map(r => r.slice(startCol, endCol + 1));
}
// Extract team name and score from a string like "bullets (890)" or "polar bears (-300)"
function parseTeamHeader(raw) {
  const str = String(raw || '').trim();
  const match = str.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), score: match[2].trim() };
  }
  return { name: str, score: null };
}
// ── Config ───────────────────────────────────────────────────────────────────
const LIVE_SCORING_URL = "/api/sheet?name=live-scoring";
const SCHEDULE_URL = "/api/sheet?name=schedule";
const els = {
  liveRow:     document.getElementById("live-scoring"),
  liveModal:   document.getElementById("live-modal"),
  liveDetails: document.getElementById("live-details"),
};
// ── Logic ────────────────────────────────────────────────────────────────────
function extractLeagueDay(rows) {
  const row = rows.find(r =>
    String(r[0] || '').includes('League Day') ||
    String(r[1] || '').includes('League Day')
  );
  if (!row) return '';
  const cell = String(row[0] || row[1] || '');
  const parts = cell.split(':');
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
    let team1Raw = '', team2Raw = '', headerIndex = 0;
    for (let i = 0; i < block.length; i++) {
      const c = block[i] || [];
      const left  = String(c[0] || '').trim();
      const right = String(c[4] || '').trim();
      if (left && right && !left.startsWith('@') && !right.startsWith('@') &&
          !left.includes('League Day') && !right.includes('League Day')) {
        team1Raw = left; team2Raw = right; headerIndex = i; break;
      }
    }
    if (!team1Raw || !team2Raw) return;
    const t1 = parseTeamHeader(team1Raw);
    const t2 = parseTeamHeader(team2Raw);
    const players = block.slice(headerIndex + 1)
      .filter(row => String(row[0] || row[4] || '').trim() !== '');
    games.push({
      team1: t1.name,
      team2: t2.name,
      team1Score: t1.score,
      team2Score: t2.score,
      key: `${normalizeTeamName(t1.name)}|${normalizeTeamName(t2.name)}`,
      team1Players: players.map(r => ({ player: r[0]||'', points: r[1]||'', rank: r[2]||'' })),
      team2Players: players.map(r => ({ player: r[4]||'', points: r[5]||'', rank: r[6]||'' })),
    });
  });
  return games;
}
function getLiveScheduleIndexes(scheduleRows) {
  const headers = (scheduleRows[0] || []).map(h => String(h || '').trim().toLowerCase());
  const findIdx = checks => headers.findIndex(h => checks.some(c => h.includes(c)));
  let date  = findIdx(['date']);
  let team1 = findIdx(['team 1','team1','away']);
  let team2 = findIdx(['team 2','team2','home']);
  if (team1 === -1 || team2 === -1) {
    if ((scheduleRows[0] || []).length >= 4) {
      if (date  === -1) date  = 1;
      if (team1 === -1) team1 = 2;
      if (team2 === -1) team2 = 3;
    } else {
      if (date  === -1) date  = 0;
      if (team1 === -1) team1 = 1;
      if (team2 === -1) team2 = 2;
    }
  }
  return { date, team1, team2 };
}
function renderLiveScoring(liveRows, scheduleRows) {
  if (!liveRows.length) { els.liveRow.textContent = 'No live scoring available.'; return; }
  const leagueDay = extractLeagueDay(liveRows);
  const liveGames = parseLiveGames(liveRows);
  const liveMap = new Map(liveGames.map(g => [g.key, g]));
  const idx = getLiveScheduleIndexes(scheduleRows);
  let games = scheduleRows.slice(1)
    .filter(row => String(row[idx.date] || '').trim() === leagueDay)
    .map(row => {
      const team1 = String(row[idx.team1] || '').trim();
      const team2 = String(row[idx.team2] || '').trim();
      const key = `${normalizeTeamName(team1)}|${normalizeTeamName(team2)}`;
      const live = liveMap.get(key) || null;
      return {
        team1, team2,
        team1Score: live ? live.team1Score : null,
        team2Score: live ? live.team2Score : null,
        team1Players: live ? live.team1Players : [],
        team2Players: live ? live.team2Players : [],
      };
    });
  if (!games.length) games = liveGames;
  if (!games.length) { els.liveRow.textContent = 'No live games found.'; return; }
  // Helper to render score badge
  const scoreBadge = (score) => score !== null
    ? `<span class="team-score">(${escapeHtml(score)})</span>` : '';
  els.liveRow.innerHTML = `<div class="live-list">${games.map((g, i) => `
    <div class="live-row-item" data-index="${i}">
      <div class="live-matchup">
        <span class="team-name"><strong>${escapeHtml(g.team1)}</strong> ${scoreBadge(g.team1Score)}</span>
        <span class="vs">vs</span>
        <span class="team-name"><strong>${escapeHtml(g.team2)}</strong> ${scoreBadge(g.team2Score)}</span>
      </div>
    </div>`).join('')}</div>`;
  els.liveRow.onclick = event => {
    const rowEl = event.target.closest('.live-row-item');
    if (!rowEl) return;
    const game = games[Number(rowEl.dataset.index)];
    let team1Style = "";
let team2Style = "";

const score1 = parseFloat(game.team1Score);
const score2 = parseFloat(game.team2Score);

if(!isNaN(score1) && !isNaN(score2)){
  if(score1 > score2){
    team1Style = "color:lime;";
    team2Style = "color:red;";
  } else if(score2 > score1){
    team1Style = "color:red;";
    team2Style = "color:lime;";
  }
}
    if (!game) return;
    const tbl = (players, name, score) => `
      <div class="boxscore-card">
        <div class="boxscore-team">
          ${escapeHtml(name)}
          ${score !== null ? `<span class="boxscore-score">(${escapeHtml(score)})</span>` : ''}
        </div>
        <div class="boxscore-row header-row"><span>Player</span><span>Points</span><span>Rank</span></div>
        ${players.filter(p => String(p.player || '').trim()).map(p => `
          <div class="boxscore-row">
            <span>${escapeHtml(p.player)}</span>
            <span>${escapeHtml(p.points)}</span>
            <span>${escapeHtml(p.rank)}</span>
          </div>`).join('') || '<div class="boxscore-empty">No stats yet.</div>'}
      </div>`;
    els.liveDetails.innerHTML =
      tbl(game.team1Players, game.team1, game.team1Score) +
      tbl(game.team2Players, game.team2, game.team2Score);
    els.liveModal.hidden = false;
  };
}
// ── Fetch & Boot ─────────────────────────────────────────────────────────────
async function fetchSheet(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const rows = parseCSV(await res.text());
  if (!rows.length) throw new Error('No data found.');
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
    els.liveRow.textContent = 'Failed to load: ' + err.message;
  }
}
document.addEventListener('click', e => {
  if (e.target.matches("[data-close='true']")) els.liveModal.hidden = true;
});
loadData();
let teamAStyle = "";
let teamBStyle = "";

if(totalA > totalB){
  teamAStyle = "color:lime;";
  teamBStyle = "color:red;";
} else if(totalB > totalA){
  teamAStyle = "color:red;";
  teamBStyle = "color:lime;";
}
