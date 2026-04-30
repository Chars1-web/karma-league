
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

const LIVE_SCORING_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=712264809&single=true&output=csv";
const SCHEDULE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=1186488561&single=true&output=csv";

const els = {
  liveRow: document.getElementById("live-scoring"),
  liveModal: document.getElementById("live-modal"),
  liveDetails: document.getElementById("live-details"),
};

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
  const games = [];

  const BLOCKS = [
    [5, 6, 7, 8, 9],
    [13, 14, 15, 16, 17],
    [21, 22, 23, 24, 25],
    [29, 30, 31, 32, 33],
    [37, 38, 39, 40, 41],
    [45, 46, 47, 48, 49]
  ];

  for (const block of BLOCKS) {
    const teamRow = rows[block[0] - 1];
    const playerRows = block.slice(1).map(r => rows[r - 1]);

    const rightTeamRow = teamRow.map((_, i) => rows[block[0] - 1]?.[i + 4]);

    const t1 = parseTeamHeader(teamRow[0]);
    const t2 = parseTeamHeader(rightTeamRow[4]);

    const team1Players = [];
    const team2Players = [];

    for (const r of playerRows) {
      if (!r) continue;

      // LEFT SIDE (A + C)
      const leftName = String(r[0] || '').trim();
      const leftRank = parseFloat(r[2]);

      if (leftName) {
        team1Players.push({
          player: cleanName(leftName),
          rank: leftRank,
          score: isNaN(leftRank) ? 0 : (isCaptain(leftName) ? leftRank / 1.5 : leftRank),
          captain: isCaptain(leftName)
        });
      }

      // RIGHT SIDE (E + G)
      const rightName = String(r[4] || '').trim();
      const rightRank = parseFloat(r[6]);

      if (rightName) {
        team2Players.push({
          player: cleanName(rightName),
          rank: rightRank,
          score: isNaN(rightRank) ? 0 : (isCaptain(rightName) ? rightRank / 1.5 : rightRank),
          captain: isCaptain(rightName)
        });
      }
    }

    const sum = arr =>
      String(Math.round(arr.reduce((s, p) => s + p.score, 0)));

    games.push({
      team1: t1.name,
      team2: t2.name,
      team1Players,
      team2Players,
      team1Score: sum(team1Players),
      team2Score: sum(team2Players),
      key: `${normalizeTeamName(t1.name)}|${normalizeTeamName(t2.name)}`
    });
  }

  return games;
}

function getLiveScheduleIndexes(scheduleRows) {
  const headers = (scheduleRows[0] || []).map(h => String(h || '').trim().toLowerCase());
  const findIdx = checks => headers.findIndex(h => checks.some(c => h.includes(c)));
  let date = findIdx(['date']);
  let team1 = findIdx(['team 1','team1','away']);
  let team2 = findIdx(['team 2','team2','home']);
  if (team1 === -1 || team2 === -1) {
    date = 0; team1 = 1; team2 = 2;
  }
  return { date, team1, team2 };
}
function renderLiveScoring(liveRows, scheduleRows) {
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
      return live || { team1, team2, team1Score:null, team2Score:null, team1Players:[], team2Players:[] };
    });

  if (!games.length) games = liveGames;

  document.getElementById("live-badge").style.display = "inline-flex";
  window._liveGames = games;

  const formatNum = n => {
    if (n === null || n === undefined || n === '') return '-';
    return Number(n).toLocaleString();
  };

  els.liveRow.innerHTML = `<div class="live-list">${games.map((g,i)=>{

    const s1 = parseFloat(g.team1Score);
    const s2 = parseFloat(g.team2Score);

    const t1Win = !isNaN(s1) && !isNaN(s2) && s1 < s2;
    const t2Win = !isNaN(s1) && !isNaN(s2) && s2 < s1;

    return `
    <div class="live-row-item" data-index="${i}">
      <div class="live-matchup">

        <div class="team-side">
          <div class="team-name">${t1Win ? '🏆 ' : ''}${escapeHtml(g.team1)}</div>
          <div class="team-score">${formatNum(g.team1Score)}</div>
        </div>

        <div class="center-info">
          <div class="vs">VS</div>
          <div class="tap">Tap For Box Score</div>
        </div>

        <div class="team-side">
          <div class="team-name">${t2Win ? '🏆 ' : ''}${escapeHtml(g.team2)}</div>
          <div class="team-score">${formatNum(g.team2Score)}</div>
        </div>

      </div>
    </div>`;
  }).join('')}</div>`;

  els.liveRow.onclick = e => {
    const rowEl = e.target.closest('.live-row-item');
    if (!rowEl) return;
    const game = games[Number(rowEl.dataset.index)];

    const s1 = parseFloat(game.team1Score);
    const s2 = parseFloat(game.team2Score);

    const t1Win = !isNaN(s1) && !isNaN(s2) && s1 < s2;
    const t2Win = !isNaN(s1) && !isNaN(s2) && s2 < s1;

    const tbl = (players, name, score, winner) => `
      <div class="boxscore-card">
        <div class="boxscore-team">
          <span>${winner ? '🏆 ' : ''}${escapeHtml(name)}</span>
          <span class="boxscore-score">${formatNum(score)}</span>
        </div>
        <div class="boxscore-row header-row"><span>Player</span><span>Rank</span></div>
        ${players.map(p=>`
          <div class="boxscore-row">
            <span>${escapeHtml(p.player)}</span>
            <span>${p.captain ? p.rank + ' → ' + Math.round(p.score).toLocaleString() : Number(p.rank).toLocaleString()}</span>
          </div>`).join('')}
      </div>`;

    els.liveDetails.innerHTML =
      tbl(game.team1Players, game.team1, game.team1Score, t1Win) +
      tbl(game.team2Players, game.team2, game.team2Score, t2Win);

    els.liveModal.hidden = false;
  };
}

async function fetchSheet(url){
  const res = await fetch(url);
  const rows = parseCSV(await res.text());
  return rows;
}

async function loadData(){
  try{
    const [liveData,scheduleData] = await Promise.all([fetchSheet(LIVE_SCORING_URL),fetchSheet(SCHEDULE_URL)]);
    renderLiveScoring(liveData,scheduleData);
  }catch(err){
    els.liveRow.textContent = "Failed to load: " + err.message;
    console.log(err);
  }
}

document.addEventListener("click",e=>{
  if(e.target.matches("[data-close='true']")) els.liveModal.hidden = true;
});

loadData();