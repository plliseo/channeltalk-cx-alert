/**
 * 📊 주간 VOC + AI 성과 리포트
 * - 매주 월요일 09:10 발송
 */

const nodemailer = require('nodemailer');
const { loadWeek } = require('./saveData');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
const KST = 9 * 3600000;

function getWeekRange() {
  const now = new Date();
  const todayKST = new Date(now.getTime() + KST);
  const dow = todayKST.getUTCDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;

  const thisMon = new Date(Date.UTC(
    todayKST.getUTCFullYear(), todayKST.getUTCMonth(), todayKST.getUTCDate()
  ) - daysFromMon * 86400000);

  const lastMon = new Date(thisMon.getTime() - 7 * 86400000);
  const lastSun = new Date(thisMon.getTime() - 86400000);

  const fmt = ts => {
    const d = new Date(ts);
    return `${d.getUTCMonth()+1}/${d.getUTCDate()}`;
  };

  return {
    since: lastMon.getTime(),
    until: lastSun.getTime(),
    label: `${fmt(lastMon.getTime())} (월) ~ ${fmt(lastSun.getTime())} (일)`,
    todayStr: todayKST.toISOString().slice(0, 10)
  };
}

function mergeStats(days) {
  const merged = {
    total: 0, alf: 0, workflow: 0, humanDone: 0, pending: 0,
    tags: {}, hourly: {}, dayStats: []
  };

  days.forEach(day => {
    const sources = [day.overnight, day.business].filter(Boolean);
    let dayTotal = 0, dayALF = 0;

    sources.forEach(s => {
      merged.total += s.total;
      merged.alf += s.alf;
      merged.workflow += s.workflow;
      merged.humanDone += s.humanDone;
      merged.pending += s.pending;
      dayTotal += s.total;
      dayALF += s.alf;

      Object.entries(s.tags || {}).forEach(([t, c]) => {
        merged.tags[t] = (merged.tags[t] || 0) + c;
      });
      Object.entries(s.hourly || {}).forEach(([h, c]) => {
        merged.hourly[h] = (merged.hourly[h] || 0) + c;
      });
    });

    if (dayTotal > 0) {
      const dow = new Date(day.date).getUTCDay();
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      merged.dayStats.push({ date: day.date, day: dayNames[dow], total: dayTotal, alf: dayALF });
    }
  });

  return merged;
}

function pct(num, total) {
  return total === 0 ? '0%' : Math.round(num / total * 100) + '%';
}

function delta(curr, prev) {
  const diff = curr - prev;
  if (diff > 0) return `<span style="color:#d93025;font-size:11px"> ▲${diff}</span>`;
  if (diff < 0) return `<span style="color:#34a853;font-size:11px"> ▼${Math.abs(diff)}</span>`;
  return `<span style="color:#888;font-size:11px"> -</span>`;
}

function bar(val, max, color) {
  const w = max === 0 ? 0 : Math.round(val / max * 100);
  return `<div style="display:inline-block;width:${w}px;height:10px;background:${color};border-radius:4px;vertical-align:middle;margin-right:6px;min-width:2px"></div>${val}건`;
}

function buildReport(curr, prev, ranges) {
  const topTags = Object.entries(curr.tags).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const timeSlots = { '00-06시': 0, '06-09시': 0, '09-12시': 0, '12-15시': 0, '15-18시': 0, '18-24시': 0 };
  Object.entries(curr.hourly).forEach(([h, c]) => {
    const hour = parseInt(h);
    if (hour < 6) timeSlots['00-06시'] += c;
    else if (hour < 9) timeSlots['06-09시'] += c;
    else if (hour < 12) timeSlots['09-12시'] += c;
    else if (hour < 15) timeSlots['12-15시'] += c;
    else if (hour < 18) timeSlots['15-18시'] += c;
    else timeSlots['18-24시'] += c;
  });

  const maxDay  = Math.max(...curr.dayStats.map(d => d.total), 1);
  const maxTime = Math.max(...Object.values(timeSlots), 1);
  const maxTag  = Math.max(...topTags.map(([, c]) => c), 1);

  const tagRows = topTags.map(([tag, cnt], i) => {
    const prevCnt = prev.tags[tag] || 0;
    return `<tr>
      <td style="color:#888;font-size:12px;width:24px">${i+1}</td>
      <td><span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:12px;font-size:12px">${tag}</span></td>
      <td style="text-align:right;white-space:nowrap">${cnt}건${delta(cnt, prevCnt)}</td>
    </tr>`;
  }).join('');

  const dayRows = curr.dayStats.sort((a,b)=>a.date.localeCompare(b.date)).map(d => {
    const isMax = d.total === maxDay;
    return `<tr>
      <td style="font-weight:${isMax?'bold':'normal'};color:${isMax?'#d93025':'#333'}">${d.day}요일 (${d.date.slice(5)})</td>
      <td>${bar(d.total, maxDay, isMax?'#d93025':'#1a73e8')}</td>
      <td style="text-align:right;color:#1a73e8;font-size:12px">🤖 ${d.alf}건</td>
    </tr>`;
  }).join('');

  const timeRows = Object.entries(timeSlots).map(([slot, cnt]) => {
    const isMax = cnt === maxTime;
    return `<tr>
      <td style="font-weight:${isMax?'bold':'normal'};color:${isMax?'#d93025':'#333'}">${slot}</td>
      <td>${bar(cnt, maxTime, isMax?'#d93025':'#34a853')}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f5f5f5}
  .container{background:white;margin:20px;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:linear-gradient(135deg,#4285f4,#9334e6);color:white;padding:24px}
  .header h1{margin:0;font-size:20px}
  .header p{margin:6px 0 0;opacity:.85;font-size:13px}
  .summary{display:flex;gap:12px;padding:20px;background:#f8f9fa;flex-wrap:wrap}
  .stat{flex:1;min-width:120px;background:white;border-radius:8px;padding:16px;text-align:center;border:1px solid #e0e0e0}
  .stat .num{font-size:28px;font-weight:bold}
  .stat .sub{font-size:11px;margin-top:2px}
  .stat .label{font-size:11px;color:#666;margin-top:4px}
  .section{padding:20px;border-top:1px solid #f0f0f0}
  .section h2{font-size:15px;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #f0f0f0}
  .two-col{display:flex;gap:16px}
  .two-col>div{flex:1}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f8f9fa;padding:8px 12px;text-align:left;color:#555;font-weight:600}
  td{padding:8px 12px;border-bottom:1px solid #f0f0f0}
  tr:last-child td{border-bottom:none}
  .alf-box{background:#e8f5e9;border-radius:8px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:16px}
  .alf-big{font-size:40px;font-weight:bold;color:#34a853}
  .no-data{text-align:center;padding:24px;color:#999;font-size:13px;background:#f8f9fa;border-radius:8px}
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>📊 주간 VOC + AI 성과 리포트</h1>
    <p>집계 기간: ${ranges.label}</p>
  </div>
  <div class="summary">
    <div class="stat">
      <div class="num" style="color:#333">${curr.total}</div>
      <div class="sub">${delta(curr.total, prev.total)} 전주 대비</div>
      <div class="label">📨 총 문의</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#34a853">${curr.humanDone}</div>
      <div class="sub" style="color:#999">${pct(curr.humanDone, curr.total)}</div>
      <div class="label">✅ 사람 처리</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#1a73e8">${curr.alf + curr.workflow}</div>
      <div class="sub" style="color:#999">${pct(curr.alf + curr.workflow, curr.total)}</div>
      <div class="label">🤖 AI 처리</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#f29900">${curr.pending}</div>
      <div class="sub">${delta(curr.pending, prev.pending)} 전주 대비</div>
      <div class="label">⏳ 미처리</div>
    </div>
  </div>
  <div class="section">
    <h2>🏷️ VOC 카테고리 TOP 10</h2>
    ${topTags.length > 0 ? `<table>
      <tr><th>#</th><th>카테고리</th><th style="text-align:right">건수 / 전주 대비</th></tr>
      ${tagRows}
    </table>` : '<div class="no-data">이번 주 데이터가 아직 쌓이는 중이에요 📦</div>'}
  </div>
  <div class="section">
    <h2>📅 요일별 · 시간대별 트렌드</h2>
    ${curr.dayStats.length > 0 ? `<div class="two-col">
      <div>
        <p style="font-size:13px;font-weight:600;color:#555;margin:0 0 8px">요일별 문의량</p>
        <table>
          <tr><th>날짜</th><th>건수</th><th>AI</th></tr>
          ${dayRows}
        </table>
      </div>
      <div>
        <p style="font-size:13px;font-weight:600;color:#555;margin:0 0 8px">시간대별 문의량</p>
        <table>
          <tr><th>시간대</th><th>건수</th></tr>
          ${timeRows}
        </table>
      </div>
    </div>` : '<div class="no-data">이번 주 데이터가 아직 쌓이는 중이에요 📦</div>'}
  </div>
  <div class="section">
    <h2>🤖 AI(ALF) 성과 분석</h2>
    <div class="alf-box">
      <div class="alf-big">${pct(curr.alf + curr.workflow, curr.total)}</div>
      <div>
        <div style="font-size:14px;font-weight:bold;color:#1b5e20">AI 자동 처리율</div>
        <div style="font-size:12px;color:#555;margin-top:4px">전체 ${curr.total}건 중 ${curr.alf + curr.workflow}건을 AI가 처리했어요</div>
        <div style="font-size:12px;color:#888;margin-top:2px">전주 AI 처리율: ${pct(prev.alf + prev.workflow, prev.total)}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

async function run() {
  const ranges = getWeekRange();
  const lastWeekDays = loadWeek(ranges.since, ranges.until);
  const prevWeekDays = loadWeek(ranges.since - 7 * 86400000, ranges.until - 7 * 86400000);

  const curr = mergeStats(lastWeekDays);
  const prev = mergeStats(prevWeekDays);
  const html = buildReport(curr, prev, ranges);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  await transporter.sendMail({
    from: `클로버 리포트 <${GMAIL_USER}>`,
    to: GMAIL_USER,
    subject: `📊 [페이쌤] 주간 VOC 리포트 | ${ranges.label} (총 ${curr.total}건)`,
    html
  });

  console.log(`✅ 주간 리포트 발송 완료 | ${ranges.label} | ${curr.total}건`);
}

module.exports = { run };
