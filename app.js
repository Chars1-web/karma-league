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
return String(name || ‘’)
.replace(/([^)]*)/g, ‘’)
.replace(/[:*]/g, ‘’)
.replace(/[^a-zA-Z0-9 ]/g, ’ ’).replace(/\s+/g, ’ ’)
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

function parseTeamHeader(raw) {
const str = String(raw || ‘’).trim();
const match = str.match(/^(.+?)\s*(([^)]+))\s*$/);
if (match) return { name: match[1].trim(), score: match[2].trim() };
return { name: str, score: null };
}

// Detect captain marker — “C” at start or end, or “(C)”
function isCaptain(name) {
const s = String(name || ‘’).trim();
return /(C)/i.test(s) || /^C\s+/.test(s) || /\s+C$/.test(s);
}

// Strip captain marker from display name
function cleanName(name) {
return String(name || ‘’)
.replace(/(C)/gi, ‘’)
.replace(/^C\s+/, ‘’)
.replace(/\s+C$/, ‘’)
.trim();
}

// ── Config ───────────────────────────────────────────────────────────────────
const LIVE_SCORING_URL = “/api/sheet?name=live-scoring”;
const SCHEDULE_URL     = “/api/sheet?name=schedule”;

const els = {
liveRow:     document.getElementById(“live-scoring”),
liveModal:   document.getElementById(“live-modal”),
liveDetails: document.getElementById(“live-details”),
};

// ── Logic ────────────────────────────────────────────────────────────────────
function extractLeagueDay(rows) {
const row = rows.find(r =>
String(r[0] || ‘’).includes(‘League Day’) ||
String(r[1] || ‘’).includes(‘League Day’)
);
if (!row) return ‘’;
const cell = String(row[0] || row[1] || ‘’);
const parts = cell.split(’:’);
return parts.length > 1 ? parts[1].trim() : cell.trim();
}

function parseLiveGames(rows) {
const RANGES = [
“A5:G11”,“A13:G19”,“A21:G27”,“A29:G35”,“A37:G43”,
“A45:G51”,“A53:G59”,“A61:G67”,“A69:G75”,“A77:G83”,
“A85:G91”,“A93:G99”,“A101:G107”,“A109:G115”,“A117:G122”,
];

const games = [];
RANGES.forEach(range => {
const block = sliceRange(rows, range);
if (!block.length) return;

```
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

const playerRows = block.slice(headerIndex + 1)
  .filter(row => String(row[0] || row[4] || '').trim() !== '');

// Build player list — col 0/4 = name (may have C), col 2/6 = rank
const buildPlayers = (pRows, nameCol, rankCol) => pRows.map(r => {
  const rawName = String(r[nameCol] || '').trim();
  if (!rawName) return null;
  const captain = isCaptain(rawName);
  const name    = cleanName(rawName);
  const rawRank = parseFloat(String(r[rankCol] || '').trim());
  const score   = isNaN(rawRank) ? null : (captain ? rawRank / 1.5 : rawRank);
  return { player: name, rank: isNaN(rawRank) ? '' : String(rawRank), score, captain };
}).filter(Boolean);

const team1Players = buildPlayers(playerRows, 0, 2);
const team2Players = buildPlayers(playerRows, 4, 6);

// Team score = sum of all player scores
const sumScore = (players) => {
  const valid = players.filter(p => p.score !== null);
  if (!valid.length) return null;
  return String(Math.round(valid.reduce((s, p) => s + p.score, 0)));
};

games.push({
  team1: t1.name,
  team2: t2.name,
  team1Score: sumScore(team1Players),
  team2Score: sumScore(team2Players),
  key: `${normalizeTeamName(t1.name)}|${normalizeTeamName(t2.name)}`,
  team1Players,
  team2Players,
});
```

});
return games;
}

function getLiveScheduleIndexes(scheduleRows) {
const headers = (scheduleRows[0] || []).map(h => String(h || ‘’).trim().toLowerCase());
const findIdx = checks => headers.findIndex(h => checks.some(c => h.includes(c)));
let date  = findIdx([‘date’]);
let team1 = findIdx([‘team 1’,‘team1’,‘away’]);
let team2 = findIdx([‘team 2’,‘team2’,‘home’]);
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
if (!liveRows.length) { els.liveRow.textContent = ‘No live scoring available.’; return; }

const leagueDay = extractLeagueDay(liveRows);
const liveGames = parseLiveGames(liveRows);
const liveMap   = new Map(liveGames.map(g => [g.key, g]));
const idx       = getLiveScheduleIndexes(scheduleRows);

let games = scheduleRows.slice(1)
.filter(row => String(row[idx.date] || ‘’).trim() === leagueDay)
.map(row => {
const team1 = String(row[idx.team1] || ‘’).trim();
const team2 = String(row[idx.team2] || ‘’).trim();
const key   = `${normalizeTeamName(team1)}|${normalizeTeamName(team2)}`;
const live  = liveMap.get(key) || null;
return {
team1, team2,
team1Score:   live ? live.team1Score   : null,
team2Score:   live ? live.team2Score   : null,
team1Players: live ? live.team1Players : [],
team2Players: live ? live.team2Players : [],
};
});

if (!games.length) games = liveGames;
if (!games.length) { els.liveRow.textContent = ‘No live games found.’; return; }

// Add live indicator to page title area if element exists
const liveBadge = document.getElementById(‘live-badge’);
if (liveBadge) liveBadge.style.display = ‘inline-flex’;

const scoreBadge = (score) => score !== null
? `<span class="team-score">(${escapeHtml(score)})</span>` : ‘’;

window._liveGames = games;
els.liveRow.innerHTML = `<div class="live-list">${games.map((g, i) => `
<div class="live-row-item" data-index="${i}">
<div class="live-matchup">
<span class="team-name"><strong>${escapeHtml(g.team1)}</strong> ${scoreBadge(g.team1Score)}</span>
<span class="vs">vs</span>
<span class="team-name"><strong>${escapeHtml(g.team2)}</strong> ${scoreBadge(g.team2Score)}</span>
</div>
</div>`).join('')}</div>`;

els.liveRow.onclick = event => {
const rowEl = event.target.closest(’.live-row-item’);
if (!rowEl) return;
const game = games[Number(rowEl.dataset.index)];
if (!game) return;

```
const s1 = parseFloat(game.team1Score);
const s2 = parseFloat(game.team2Score);
// Lower score = winning
const t1Color = !isNaN(s1) && !isNaN(s2)
  ? (s1 < s2 ? 'color:lime;' : s1 > s2 ? 'color:#ff3c6e;' : '') : '';
const t2Color = !isNaN(s1) && !isNaN(s2)
  ? (s2 < s1 ? 'color:lime;' : s2 > s1 ? 'color:#ff3c6e;' : '') : '';

const tbl = (players, name, score, nameColor) => `
  <div class="boxscore-card">
    <div class="boxscore-team">
      <span style="${nameColor}">${escapeHtml(name)}</span>
      ${score !== null ? `<span class="boxscore-score">(${escapeHtml(score)})</span>` : ''}
    </div>
    <div class="boxscore-row header-row">
      <span>Player</span><span>Rank</span>
    </div>
    ${players.filter(p => p.player).map(p => `
      <div class="boxscore-row">
        <span>${escapeHtml(p.player)}</span>
        <span>${p.captain
          ? (p.score !== null ? Math.round(p.score) + ' ✦' : '—')
          : (escapeHtml(p.rank) || '—')}</span>
      </div>`).join('')
      || '<div class="boxscore-empty">No stats yet.</div>'}
  </div>`;

els.liveDetails.innerHTML =
  tbl(game.team1Players, game.team1, game.team1Score, t1Color) +
  tbl(game.team2Players, game.team2, game.team2Score, t2Color);

els.liveModal.hidden = false;
```

};
}

// ── Fetch & Boot ─────────────────────────────────────────────────────────────
async function fetchSheet(url) {
const res = await fetch(url, { cache: ‘no-store’ });
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const rows = parseCSV(await res.text());
if (!rows.length) throw new Error(‘No data found.’);
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
els.liveRow.textContent = ’Failed to load: ’ + err.message;
}
}

document.addEventListener(‘click’, e => {
if (e.target.matches(”[data-close=‘true’]”)) els.liveModal.hidden = true;
});

loadData();