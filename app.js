// ───────────────── HELPERS ─────────────────
function parseCSV(text){
  const rows=[];let row=[],value="",inQuotes=false;
  for(let i=0;i<text.length;i++){
    const char=text[i],next=text[i+1];
    if(char=='"'){
      if(inQuotes&&next=='"'){value+='"';i++;}
      else inQuotes=!inQuotes;
      continue;
    }
    if(char==','&&!inQuotes){row.push(value.trim());value="";continue;}
    if((char=='\n'||char=='\r')&&!inQuotes){
      if(char=='\r'&&next=='\n')i++;
      row.push(value.trim());
      if(row.length>1||row[0]!=='')rows.push(row);
      row=[];value="";continue;
    }
    value+=char;
  }
  if(value.length||row.length){row.push(value.trim());rows.push(row);}
  return rows;
}

function formatNumber(num){
  if(num===null||num===undefined||num==='') return '—';
  const n=Number(num);
  if(isNaN(n)) return num;
  return n.toLocaleString();
}

function isCaptain(name){
  const s=String(name||'').trim();
  return /\(C\)/i.test(s)||/^C\s+/.test(s)||/\s+C$/.test(s);
}

function cleanName(name){
  return String(name||'')
    .replace(/\(C\)/gi,'')
    .replace(/^C\s+/,'')
    .replace(/\s+C$/,'')
    .trim();
}

function colToIndex(letter){
  return letter.toUpperCase().charCodeAt(0)-65;
}

function sliceRange(rows,range){
  const m=range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if(!m)return[];
  const sc=colToIndex(m[1]),ec=colToIndex(m[3]),sr=+m[2]-1,er=+m[4]-1;
  return rows.slice(sr,er+1).map(r=>r.slice(sc,ec+1));
}

function parseTeamHeader(raw){
  const str=String(raw||'').trim();
  const match=str.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if(match)return{name:match[1].trim(),score:match[2].trim()};
  return{name:str,score:null};
}

// ───────────────── CONFIG ─────────────────
const LIVE_SCORING_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=712264809&single=true&output=csv";
const SCHEDULE_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vSe6mW01Q2kgWDNkm-WDUtJziEmKHcpvvP-TKHy84jTjTXE_qIjEQZPDDPb36Xqn5k8t5-kpB6ipq1N/pub?gid=1186488561&single=true&output=csv";

const GAME_RANGES=[
"A5:G9","A12:G16","A19:G23","A26:G30","A33:G37",
"A40:G44","A47:G51","A54:G58","A61:G65","A68:G72",
"A75:G79","A82:G86","A89:G93","A96:G100","A103:G107"
];

const els={
  liveRow:document.getElementById("live-scoring"),
  liveModal:document.getElementById("live-modal"),
  liveDetails:document.getElementById("live-details")
};

let currentGames=[];

// ───────────────── TABS ─────────────────
document.querySelectorAll('.tab').forEach(t=>{
  t.onclick=()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('tab-'+t.dataset.tab).classList.add('active');
  };
});

// ───────────────── SCHEDULE ─────────────────
function renderSchedule(rows){
  const c=document.getElementById("schedule-content");
  const matchups=rows.slice(1).map(r=>({
    date:r[0],
    team1:r[1],
    team2:r[2]
  })).filter(m=>m.team1&&m.team2);

  const grouped={};
  matchups.forEach(m=>{
    if(!grouped[m.date]) grouped[m.date]=[];
    grouped[m.date].push(m);
  });

  c.innerHTML=Object.keys(grouped).map(date=>`
    <div class="schedule-group">
      <div class="schedule-date">${date}</div>
      ${grouped[date].map(m=>`
      <div class="schedule-row">
        <span class="sched-team">${m.team1}</span>
        <span class="sched-vs">vs</span>
        <span class="sched-team right">${m.team2}</span>
      </div>`).join('')}
    </div>`).join('');
}

// ───────────────── LIVE PARSER ─────────────────
function parseLiveGames(rows){
  const games=[];

  const START_ROWS=[5,13,21,29,37,45,53,61,69,77,85,93,101];

  START_ROWS.forEach(start=>{
    const header=rows[start-1];
    if(!header)return;

    const t1=parseTeamHeader(header[0]);
    const t2=parseTeamHeader(header[4]);

    if(!t1.name||!t2.name)return;

    const team1Players=[];
    const team2Players=[];

    for(let r=start;r<start+4;r++){
      const row=rows[r];
      if(!row)continue;

      const leftRaw=String(row[0]||'').trim();
      const rightRaw=String(row[4]||'').trim();

      if(leftRaw){
        const captain=isCaptain(leftRaw);
        const rank=parseFloat(row[2]);
        team1Players.push({
          player:cleanName(leftRaw),
          rank:isNaN(rank)?null:rank,
          adj:isNaN(rank)?0:(captain?rank/1.5:rank),
          captain
        });
      }

      if(rightRaw){
        const captain=isCaptain(rightRaw);
        const rank=parseFloat(row[6]);
        team2Players.push({
          player:cleanName(rightRaw),
          rank:isNaN(rank)?null:rank,
          adj:isNaN(rank)?0:(captain?rank/1.5:rank),
          captain
        });
      }
    }

    const sum=arr=>Math.round(arr.reduce((s,p)=>s+p.adj,0));

    games.push({
      team1:t1.name,
      team2:t2.name,
      team1Players,
      team2Players,
      team1Score:sum(team1Players),
      team2Score:sum(team2Players)
    });
  });

  return games;
}

// ───────────────── LIVE RENDER ─────────────────
function renderLiveScoring(rows){
  const games=parseLiveGames(rows);
  currentGames=games;

  document.getElementById("live-badge").style.display=games.length?'inline-block':'none';

  els.liveRow.innerHTML=`<div class="live-list">${games.map((g,i)=>{
    const t1Win=g.team1Score<g.team2Score;
    const t2Win=g.team2Score<g.team1Score;
    const diff=Math.abs(g.team1Score-g.team2Score);
    const total=g.team1Score+g.team2Score||1;

    let rawT1=Math.round((g.team2Score/total)*100);
    const hour=new Date().getHours();
    let t1Pct=hour<17?Math.round(50+((rawT1-50)*0.18)):rawT1;

    const all=[...g.team1Players,...g.team2Players].filter(x=>x.rank!==null);
    const top=all.sort((a,b)=>a.rank-b.rank)[0];

    return `
    <div class="live-row-item" data-index="${i}">
      <div class="live-matchup">
        <div>
          <div class="team-name ${t1Win?'winner':''}">${g.team1}${t1Win?'<span class="trophy">🏆</span>':''}</div>
          <div class="team-score">${formatNumber(g.team1Score)}</div>
        </div>
        <div>
          <div class="vs">VS</div>
          <div class="diff">Leads by ${formatNumber(diff)}</div>
        </div>
        <div style="text-align:right;">
          <div class="team-name ${t2Win?'winner':''}">${g.team2}${t2Win?'<span class="trophy">🏆</span>':''}</div>
          <div class="team-score">${formatNumber(g.team2Score)}</div>
        </div>
      </div>

      <div class="projection">
        <div class="proj-label">Projected Winner • ${t1Win?g.team1:g.team2}</div>
        <div class="bar-wrap">
          <div class="bar-fill" style="width:${Math.max(t1Pct,100-t1Pct)}%"></div>
        </div>
      </div>

      <div class="mvp">⭐ TOP PERFORMER — ${top?top.player:'---'} (${top?formatNumber(top.rank):''})</div>
    </div>`;
  }).join('')}</div>`;
}

// ───────────────── MODAL ─────────────────
els.liveRow.addEventListener('click',e=>{
  const row=e.target.closest('.live-row-item');
  if(!row)return;
  const game=currentGames[+row.dataset.index];
  if(!game)return;

  const all=[...game.team1Players,...game.team2Players].filter(x=>x.rank!==null);
  const best=all.sort((a,b)=>a.rank-b.rank)[0];

  const tbl=(players,name,score,win)=>`
    <div class="boxscore-card">
      <div class="boxscore-team">
        <span class="${win?'winner':''}">${name}${win?'<span class="trophy">🏆</span>':''}</span>
        <span>${formatNumber(score)}</span>
      </div>
      ${players.map(p=>{
        const adjusted=p.captain?Math.round(p.rank/1.5):p.rank;
        const rankDisplay=p.captain?`${formatNumber(p.rank)} → ${formatNumber(adjusted)}`:formatNumber(p.rank);
        return `
        <div class="boxscore-row">
          <span class="${best&&p.player===best.player?'top-player':''}">
            ${p.player} ${p.captain?'<span style="color:#ffb347;">CPT</span>':''}
          </span>
          <span class="${best&&p.player===best.player?'top-player':''}">
            ${rankDisplay}
          </span>
        </div>`;
      }).join('')}
    </div>`;

  els.liveDetails.innerHTML=
    tbl(game.team1Players,game.team1,game.team1Score,game.team1Score<game.team2Score)+
    tbl(game.team2Players,game.team2,game.team2Score,game.team2Score<game.team1Score);

  els.liveModal.hidden=false;
});

document.addEventListener('click',e=>{
  if(e.target.matches("[data-close='true']")) els.liveModal.hidden=true;
});

// ───────────────── FETCH ─────────────────
async function fetchSheet(url){
  const res=await fetch(url+"&t="+Date.now(),{cache:"no-store"});
  return parseCSV(await res.text());
}

async function loadData(){
  const [live,schedule]=await Promise.all([
    fetchSheet(LIVE_SCORING_URL),
    fetchSheet(SCHEDULE_URL)
  ]);

  renderLiveScoring(live);
  renderSchedule(schedule);
}

loadData();
setInterval(loadData,2500);