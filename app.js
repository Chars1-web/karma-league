// ── Helpers ──────────────────────────────────────────────────────────────────
function parseCSV(text) {
const rows = [];
let row = [], value = “”, inQuotes = false;
for (let i = 0; i < text.length; i++) {
const char = text[i], next = text[i + 1];
if (char === ‘”’) {
if (inQuotes && next === ‘”’) { value += ‘”’; i++; }
else inQuotes = !inQuotes;
continue;
}
if (char === ‘,’ && !inQuotes) { row.push(value.trim()); value = “”; continue; }
if ((char === ‘\n’ || char === ‘\r’) && !inQuotes) {
if (char === ‘\r’ && next === ‘\n’) i++;
row.push(value.trim());
if (row.length > 1 || row[0] !== ‘’) rows.push(row);
row = []; value = “”;
continue;
}
value += char;
}
if (value.length || row.length) { row.push(value.trim()); rows.push(row); }
return rows;
}

function escapeHtml(str) {
return String(str || ‘’)
.replace(/&/g, ‘&’).replace(/</g, ‘<’)
.replace(/>/g, ‘>’).replace(/”/g, ‘"’);
}

function normalizeTeamName(name) {
return String(name || ‘’).trim().toLowerCase().replace(/\s+/g, ’ ’);
}

// ── Config ────────────────────────────────────────────────────────────────────
const ROSTER_URL    = “/api/sheet?name=roster”;
const LIVE_URL      = “/api/sheet?name=live-scoring”;
const SCHEDULE_URL  = “/api/sheet?name=schedule”;

const els = {
liveRow:     document.getElementById(“live-scoring”),
liveModal:   document.getElementById(“live-modal”),
liveDetails: document.getElementById(“live-details”),
};

// ── Parse roster sheet ────────────────────────────────────────────────────────
// Columns: A=username, B=userID, C=team, D=playing(yes/no), E=captain(yes/no)
function parseRoster(rows) {
const players = [];
rows.slice(1).forEach(r => {
const username  = (r[0] || ‘’).trim();
const userId    = (r[1] || ‘’).trim();
const team      = (r[2] || ‘’).trim();
const playing   = (r[3] || ‘’).trim().toLowerCase();
const captain   = (r[4] || ‘’).trim().toLowerCase();
if (!userId || !team) return;
players.push({
username,
userId,
team,
playing: playing === ‘yes’ || playing === ‘true’ || playing === ‘1’,
captain: captain === ‘yes’ || captain === ‘true’ || captain === ‘1’,
});
});
return players;
}

// ── Parse live scoring sheet ──────────────────────────────────────────────────
// Expects rows where user IDs appear and ranks are associated with them.
// Row 1 = headers (game day headers like “Game 1”, “League Day: X”, etc.)
// Subsequent rows = player data with user ID in some column and rank in another.
// We’ll look for the current game day column and extract ranks by user ID.
function parseLiveRanks(rows) {
// rankMap: { userId: rank }
const rankMap = {};
if (!rows.length) return rankMap;

// Find the rightmost non-empty column in row 0 (headers) — that’s the current game
const headers = rows[0] || [];
let currentCol = -1;
for (let i = headers.length - 1; i >= 0; i–) {
const h = String(headers[i] || ‘’).trim();
if (h && (h.toLowerCase().includes(‘game’) || h.match(/\d/))) {
currentCol = i;
break;
}
}

// If no game column found, use last column
if (currentCol === -1) currentCol = headers.length - 1;

// Each data row: find user ID (col that starts with @ or is numeric ID)
// Based on existing code, col 1 is likely the user ID in the live sheet too
// We’ll try: col 0 = @username/rank info, scan for ID
rows.slice(1).forEach(row => {
// Try to find a user ID — look for column that looks like a numeric ID
// The live sheet format from your existing ranges used col structure:
// player @name in col A, rank in col B or C
// Since format may vary, we scan for the rank in currentCol
const userId  = (row[1] || ‘’).trim(); // col B = user ID
const rankVal = (row[currentCol] || ‘’).trim();
if (!userId || !rankVal) return;
const rank = parseFloat(rankVal);
if (!isNaN(rank)) rankMap[userId] = rank;
});

return rankMap;
}

// ── Build team scores ─────────────────────────────────────────────────────────
function buildTeamScores(players, rankMap) {
// teamData: { teamName: { players: […], totalScore: number } }
const teamData = {};

players.filter(p => p.playing).forEach(p => {
if (!teamData[p.team]) teamData[p.team] = { players: [], totalScore: 0 };

```
const rawRank = rankMap[p.userId];
let score = rawRank !== undefined ? rawRank : null;
let displayRank = rawRank !== undefined ? String(rawRank) : 'N/A';

// Captain gets rank ÷ 2 (lower = better, so halving = bonus)
if (p.captain && score !== null) {
  score = score / 2;
  displayRank = (rawRank / 2).toFixed(1) + ' ✦';
}

teamData[p.team].players.push({
  username: p.username,
  userId:   p.userId,
  captain:  p.captain,
  rawRank:  rawRank,
  score:    score,
  displayRank,
});

if (score !== null) teamData[p.team].totalScore += score;
```

});

return teamData;
}

// ── Parse schedule ────────────────────────────────────────────────────────────
function parseSchedule(rows) {
// Returns array of { team1, team2 } matchups for today
if (!rows.length) return [];
const headers = (rows[0] || []).map(h => String(h || ‘’).trim().toLowerCase());

// Find team columns
let t1Col = headers.findIndex(h => h.includes(‘team 1’) || h.includes(‘team1’) || h.includes(‘away’));
let t2Col = headers.findIndex(h => h.includes(‘team 2’) || h.includes(‘team2’) || h.includes(‘home’));
if (t1Col === -1) t1Col = 0;
if (t2Col === -1) t2Col = 1;

return rows.slice(1)
.map(row => ({
team1: (row[t1Col] || ‘’).trim(),
team2: (row[t2Col] || ‘’).trim(),
}))
.filter(m => m.team1 && m.team2);
}

// ── Render ────────────────────────────────────────────────────────────────────
function render(matchups, teamData) {
if (!matchups.length) {
els.liveRow.textContent = ‘No matchups scheduled.’;
return;
}

els.liveRow.innerHTML = `<div class="live-list">${matchups.map((m, i) => {
const t1 = teamData[m.team1] || { totalScore: 0, players: [] };
const t2 = teamData[m.team2] || { totalScore: 0, players: [] };
const s1 = t1.totalScore.toFixed(1);
const s2 = t2.totalScore.toFixed(1);

```
return `<div class="live-row-item" data-index="${i}">
  <div class="live-matchup">
    <div class="team-block">
      <span class="team-name"><strong>${escapeHtml(m.team1)}</strong></span>
      <span class="team-score">${s1}</span>
    </div>
    <span class="vs">vs</span>
    <div class="team-block">
      <span class="team-name"><strong>${escapeHtml(m.team2)}</strong></span>
      <span class="team-score">${s2}</span>
    </div>
  </div>
</div>`;
```

}).join(’’)}</div>`;

// Click to open boxscore
els.liveRow.onclick = event => {
const rowEl = event.target.closest(’.live-row-item’);
if (!rowEl) return;
const m = matchups[Number(rowEl.dataset.index)];
if (!m) return;

```
const t1 = teamData[m.team1] || { totalScore: 0, players: [] };
const t2 = teamData[m.team2] || { totalScore: 0, players: [] };

const score1 = t1.totalScore;
const score2 = t2.totalScore;

// Lower score = winning (lower rank = better)
const t1Color = score1 < score2 ? 'color:lime;' : score1 > score2 ? 'color:#ff3c6e;' : '';
const t2Color = score2 < score1 ? 'color:lime;' : score2 > score1 ? 'color:#ff3c6e;' : '';

const renderTeam = (team, data, nameColor) => `
  <div class="boxscore-card">
    <div class="boxscore-team">
      <span style="${nameColor}">${escapeHtml(team)}</span>
      <span class="boxscore-score">(${data.totalScore.toFixed(1)})</span>
    </div>
    <div class="boxscore-row header-row">
      <span>Player</span>
      <span>Rank</span>
      <span>Score</span>
    </div>
    ${data.players.length
      ? data.players.map(p => `
        <div class="boxscore-row">
          <span>${escapeHtml(p.username)}${p.captain ? ' <span style="color:#ff9f1c;font-size:11px;">✦ CPT</span>' : ''}</span>
          <span>${p.rawRank !== undefined ? p.rawRank : '—'}</span>
          <span>${p.score !== null ? p.score.toFixed(1) : '—'}</span>
        </div>`).join('')
      : '<div class="boxscore-empty">No lineup submitted.</div>'
    }
  </div>`;

els.liveDetails.innerHTML =
  renderTeam(m.team1, t1, t1Color) +
  renderTeam(m.team2, t2, t2Color);

els.liveModal.hidden = false;
```

};
}

// ── Fetch & Boot ──────────────────────────────────────────────────────────────
async function fetchSheet(url) {
const res = await fetch(url, { cache: ‘no-store’ });
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const rows = parseCSV(await res.text());
if (!rows.length) throw new Error(‘No data found.’);
return rows;
}

async function loadData() {
try {
const [rosterRows, liveRows, scheduleRows] = await Promise.all([
fetchSheet(ROSTER_URL),
fetchSheet(LIVE_URL),
fetchSheet(SCHEDULE_URL),
]);

```
const players  = parseRoster(rosterRows);
const rankMap  = parseLiveRanks(liveRows);
const matchups = parseSchedule(scheduleRows);
const teamData = buildTeamScores(players, rankMap);

render(matchups, teamData);
```

} catch (err) {
els.liveRow.textContent = ’Failed to load: ’ + err.message;
}
}

document.addEventListener(‘click’, e => {
if (e.target.matches(”[data-close=‘true’]”)) els.liveModal.hidden = true;
});

loadData();