// ── Helpers ───────────────────────────────────────────────────────────────────
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
    .replace(/\([^)]*\)/g, '')
    .replace(/[:*]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

function parseTeamHeader(raw) {
  const str = String(raw || '').trim();
  const match = str.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return { name: match[1].trim(), score: match[2].trim() };
  return { name: str, score: null };
}

function isCaptain(name) {
  const s = String(name || '').trim();
  return /\(C\)/i.test(s) || /^C\s+/.test(s) || /\s+C$/.test(s);
}

function cleanName(name) {
  return String(name || '')
    .replace(/\(C\)/gi, '')
    .replace(/^C\s+/, '')
    .replace(/\s+C$/, '')
    .trim();
}

// ── Config ────────────────────────────────────────────────────────────────────
const LIVE_SCORING_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=712264809&single=true&output=csv";
const SCHEDULE_URL     = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=1186488561&single=true&output=csv";

const els = {
  liveRow:     document.getElementById("live-scoring"),
  liveModal:   document.getElementById("live-modal"),
  liveDetails: document.getElementById("live-details"),
};

// ── Game block definitions ────────────────────────────────────────────────────
// Each entry: { teamRow (1-based), playerRows (1-based array) }
// Left side: col A (0) = name, col C (2) = rank
// Right side: col E (4) = name, col G (6) = rank
const GAME_BLOCKS = [
  { teamRow: 5,  playerRows: [6,  7,  8,  9]  },
  { teamRow: 13, playerRows: [14, 15, 16, 17] },
  { teamRow: 21, playerRows: [22, 23, 24, 25] },
  { teamRow: 29, playerRows: [30, 31, 32, 33] },
  { teamRow: 37, playerRows: [38, 39, 40, 41] },
  { teamRow: 45, playerRows: [46, 47, 48, 49] },
];

// ── Parse live games ──────────────────────────────────────────────────────────
function parseLiveGames(rows) {
  const games = [];

  for (const block of GAME_BLOCKS) {
    // rows array is 0-indexed, sheet is 1-indexed
    const teamRow = rows[block.teamRow - 1];
    if (!teamRow) continue;

    const t1 = parseTeamHeader(String(teamRow[0] || '').trim());
    const t2 = parseTeamHeader(String(teamRow[4] || '').trim());

    if (!t1.name && !t2.name) continue;

    const team1Players = [];
    const team2Players = [];

    for (const rowNum of block.playerRows) {
      const r = rows[rowNum - 1];
      if (!r) continue;

      // Left side: col A (idx 0) = name, col C (idx 2) = rank
      const leftName = String(r[0] || '').trim();
      if (leftName) {
        const rawRank = parseFloat(r[2]);
        const cpt     = isCaptain(leftName);
        team1Players.push({
          player:  cleanName(leftName),
          rank:    isNaN(rawRank) ? null : rawRank,
          score:   isNaN(rawRank) ? 0 : (cpt ? rawRank / 1.5 : rawRank),
          captain: cpt,
        });
      }

      // Right side: col E (idx 4) = name, col G (idx 6) = rank
      const rightName = String(r[4] || '').trim();
      if (rightName) {
        const rawRank = parseFloat(r[6]);
        const cpt     = isCaptain(rightName);
        team2Players.push({
          player:  cleanName(rightName),
          rank:    isNaN(rawRank) ? null : rawRank,
          score:   isNaN(rawRank) ? 0 : (cpt ? rawRank / 1.5 : rawRank),
          captain: cpt,
        });
      }
    }

    const sumScore = players =>
      String(Math.round(players.reduce((s, p) => s + p.score, 0)));

    games.push({
      team1:        t1.name,
      team2:        t2.name,
      team1Score:   sumScore(team1Players),
      team2Score:   sumScore(team2Players),
      key:          `${normalizeTeamName(t1.name)}|${normalizeTeamName(t2.name)}`,
      team1Players,
      team2Players,
    });
  }

  return games;
}

// ── Extract league day from live sheet ────────────────────────────────────────
function extractLeagueDay(rows) {
  const row = rows.find(r =>
    String(r[0] || '').includes('League Day') ||
    String(r[1] || '').includes('League Day')
  );
  if (!row) return '';
  const cell  = String(row[0] || row[1] || '');
  const parts = cell.split(':');
  return parts.length > 1 ? parts[1].trim() : cell.trim();
}

// ── Parse schedule indexes ────────────────────────────────────────────────────
function getLiveScheduleIndexes(scheduleRows) {
  const headers = (scheduleRows[0] || []).map(h => String(h || '').trim().toLowerCase());
  const findIdx = checks => headers.findIndex(h => checks.some(c => h.includes(c)));
  let date  = findIdx(['date']);
  let team1 = findIdx(['team 1','team1','away']);
  let team2 = findIdx(['team 2','team2','home']);
  if (team1 === -1 || team2 === -1) { date = 0; team1 = 1; team2 = 2; }
  return { date, team1, team2 };
}

// ── Odds Algorithm ────────────────────────────────────────────────────────────
function calcOdds(score1, score2) {
  const s1 = parseFloat(score1);
  const s2 = parseFloat(score2);
  if (isNaN(s1) || isNaN(s2) || (s1 === 0 && s2 === 0)) return null;

  const now      = new Date();
  const estHour  = (now.getUTCHours() - 5 + 24) % 24;
  const estMin   = now.getUTCMinutes();
  let minsIntoGame = 0;
  if (estHour >= 20)     minsIntoGame = (estHour - 20) * 60 + estMin;
  else if (estHour < 6)  minsIntoGame = (estHour + 4)  * 60 + estMin;
  const gameProgress = Math.min(minsIntoGame / 600, 1);

  const total   = s1 + s2;
  const gap     = Math.abs(s1 - s2);
  const gapPct  = total > 0 ? gap / total : 0;
  const maxConf = 0.55 + gameProgress * 0.4;
  const winProb = Math.min(0.5 + gapPct * maxConf * 0.5, maxConf);

  const t1Leading = s1 < s2;
  const p1 = t1Leading ? winProb : 1 - winProb;
  const p2 = 1 - p1;

  const toML = p => p >= 0.5
    ? '-' + Math.round((p / (1 - p)) * 100)
    : '+' + Math.round(((1 - p) / p) * 100);

  let conf = gameProgress < 0.2 ? 'Early — High Variance'
           : gameProgress < 0.5 ? 'Midgame'
           : gameProgress < 0.8 ? 'Late Game'
           : 'Near Final';

  return { ml1: toML(p1), ml2: toML(p2), conf, p1, p2 };
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderLiveScoring(liveRows, scheduleRows) {
  const leagueDay = extractLeagueDay(liveRows);
  const liveGames = parseLiveGames(liveRows);
  const liveMap   = new Map(liveGames.map(g => [g.key, g]));
  const idx       = getLiveScheduleIndexes(scheduleRows);

  let games = scheduleRows.slice(1)
    .filter(row => String(row[idx.date] || '').trim() === leagueDay)
    .map(row => {
      const team1 = String(row[idx.team1] || '').trim();
      const team2 = String(row[idx.team2] || '').trim();
      const key   = `${normalizeTeamName(team1)}|${normalizeTeamName(team2)}`;
      const live  = liveMap.get(key) || null;
      return live || { team1, team2, team1Score: null, team2Score: null, team1Players: [], team2Players: [] };
    });

  if (!games.length) games = liveGames;

  const liveBadge = document.getElementById('live-badge');
  if (liveBadge) liveBadge.style.display = 'inline-flex';
  window._liveGames = games;

  const fmt = n => (n === null || n === undefined || n === '') ? '—' : Number(n).toLocaleString();

  els.liveRow.innerHTML = `<div class="live-list">${games.map((g, i) => {
    const s1    = parseFloat(g.team1Score);
    const s2    = parseFloat(g.team2Score);
    const t1Win = !isNaN(s1) && !isNaN(s2) && s1 < s2;
    const t2Win = !isNaN(s1) && !isNaN(s2) && s2 < s1;
    const odds  = calcOdds(g.team1Score, g.team2Score);

    const oddsHtml = odds ? `
      <div class="odds-row">
        <span class="odds-badge ${odds.p1 > 0.5 ? 'odds-fav' : odds.p1 < 0.5 ? 'odds-dog' : 'odds-even'}">${escapeHtml(g.team1)} ${odds.ml1}</span>
        <span class="odds-badge ${odds.p2 > 0.5 ? 'odds-fav' : odds.p2 < 0.5 ? 'odds-dog' : 'odds-even'}">${escapeHtml(g.team2)} ${odds.ml2}</span>
      </div>
      <div class="odds-conf">${odds.conf}</div>` : '';

    return `
    <div class="live-row-item" data-index="${i}">
      <div class="live-matchup">
        <div class="team-side">
          <div class="team-name">${t1Win ? '🏆 ' : ''}${escapeHtml(g.team1)}</div>
          <div class="team-score">${fmt(g.team1Score)}</div>
        </div>
        <div class="center-info">
          <div class="vs">VS</div>
          <div class="tap">Tap For Box Score</div>
        </div>
        <div class="team-side">
          <div class="team-name">${t2Win ? '🏆 ' : ''}${escapeHtml(g.team2)}</div>
          <div class="team-score">${fmt(g.team2Score)}</div>
        </div>
      </div>
      ${oddsHtml}
    </div>`;
  }).join('')}</div>`;

  els.liveRow.onclick = e => {
    const rowEl = e.target.closest('.live-row-item');
    if (!rowEl) return;
    const game = games[Number(rowEl.dataset.index)];
    if (!game) return;

    const s1    = parseFloat(game.team1Score);
    const s2    = parseFloat(game.team2Score);
    const t1Win = !isNaN(s1) && !isNaN(s2) && s1 < s2;
    const t2Win = !isNaN(s1) && !isNaN(s2) && s2 < s1;

    const tbl = (players, name, score, winner) => `
      <div class="boxscore-card">
        <div class="boxscore-team">
          <span>${winner ? '🏆 ' : ''}${escapeHtml(name)}</span>
          <span class="boxscore-score">${fmt(score)}</span>
        </div>
        <div class="boxscore-row header-row"><span>Player</span><span>Rank</span></div>
        ${players.length ? players.map(p => `
          <div class="boxscore-row">
            <span>${escapeHtml(p.player)}${p.captain ? ' <span style="color:#ff9f1c;font-size:10px;font-weight:700;background:rgba(255,159,28,.15);border-radius:4px;padding:1px 5px;">CPT</span>' : ''}</span>
            <span>${p.rank !== null
              ? (p.captain ? p.rank + ' → ' + Math.round(p.score) : p.rank)
              : '—'}</span>
          </div>`).join('')
          : '<div class="boxscore-empty">No stats yet.</div>'}
      </div>`;

    els.liveDetails.innerHTML =
      tbl(game.team1Players, game.team1, game.team1Score, t1Win) +
      tbl(game.team2Players, game.team2, game.team2Score, t2Win);

    els.liveModal.hidden = false;
  };
}

// ── Fetch & Boot ──────────────────────────────────────────────────────────────
async function fetchSheet(url) {
  const res  = await fetch(url);
  return parseCSV(await res.text());
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
    console.error(err);
  }
}

document.addEventListener("click", e => {
  if (e.target.matches("[data-close='true']")) els.liveModal.hidden = true;
});

loadData();