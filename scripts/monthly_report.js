/**
 * 📈 월간 CS 리포트
 * - 매월 1일 09:00 발송
 */

const nodemailer = require('nodemailer');
const { loadRange } = require('./saveData');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
const KST = 9 * 3600000;

function getMonthRange() {
  const now = new Date();
  const todayKST = new Date(now.getTime() + KST);

  const year  = todayKST.getUTCMonth() === 0 ? todayKST.getUTCFullYear() - 1 : todayKST.getUTCFullYear();
  const month = todayKST.getUTCMonth() === 0 ? 12 : todayKST.getUTCMonth();

  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay  = new Date(Date.UTC(year, month, 0));

  const prevYear  = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevFirst = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
  const prevLast  = new Date(Date.UTC(prevYear, prevMonth, 0));

  return {
    firstDay, lastDay, prevFirst, prevLast,
    monthLabel: `${year}년 ${month}월`,
    prevMonthLabel: `${prevYear}년 ${prevMonth}월`,
    month, year
  };
}

function mergeStats(days) {
  const merged = {
    total: 0, alf: 0, workflow: 0, humanDone: 0, pending: 0,
    tags: {}, hourly: {}, dayStats: [],
    waitSecTotal: 0, waitCount: 0,
    replySecTotal: 0, replyCount: 0
  };

  days.forEach(day => {
    const sources = [day.overnight, day.business].filter(Boolean);
    let dayTotal = 0, dayALF = 0, dayPending = 0;

    sources.forEach(s => {
      merged.total += s.total;
      merged.alf += s.alf;
      merged.workflow += s.workflow;
      merged.humanDone += s.humanDone;
      merged.pending += s.pending;
      dayTotal += s.total;
      dayALF += s.alf;
      dayPending += s.pending;

      Object.entries(s.tags || {}).forEach(([t, c]) => {
        merged.tags[t] = (merged.tags[t] || 0) + c;
      });
      Object.entries(s.hourly || {}).forEach(([h, c]) => {
        merged.hourly[h] = (merged.hourly[h] || 0) + c;
      });
      if (s.avgWaitSec) { merged.waitSecTotal += s.avgWaitSec; merged.waitCount++; }
      if (s.avgReplySec) { merged.replySecTotal += s.avgReplySec; merged.replyCount++; }
    });

    if (dayTotal > 0) {
      merged.dayStats.push({ date: day.date, total: dayTotal, alf: dayALF, pending: dayPending });
    }
  });

  merged.avgWaitSec  = merged.waitCount > 0 ? Math.round(merged.waitSecTotal / merged.waitCount) : null;
  merged.avgReplySec = merged.replyCount > 0 ? Math.round(merged.replySecTotal / merged.replyCount) : null;
  return merged;
}

function getWeekStats(dayStats) {
  const weeks = [
    { label: '1주차', total: 0, alf: 0 },
    { label: '2주차', total: 0, alf: 0 },
    { label: '3주차', total: 0, alf: 0 },
    { label: '4주차', total: 0, alf: 0 },
    { label: '5주차', total: 0, alf: 0 },
  ];
  dayStats.forEach(d => {
    const date = parseInt(d.date.slice(8, 10));
    const weekIdx = Math.min(Math.floor((date - 1) / 7), 4);
    weeks[weekIdx].total += d.total;
    weeks[weekIdx].alf += d.alf;
  });
  return weeks.filter(w => w.total > 0);
}

function fmtTime(sec) {
  if (!sec) return '-';
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.round(sec / 60)}분`;
  return `${Math.floor(sec / 3600)}시간 ${Math.round((sec % 3600) / 60)}분`;
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
  const w = max === 0 ? 0 : Math.round(val / max * 140);
  return `<div style="display:inline-block;width:${w}px;height:10px;background:${color};border-radius:4px;vertical-align:middle;margin-right:6px;min-width:2px"></div>${val}건`;
}

function buildReport(curr, prev, ranges) {
  const topTags  = Object.entries(curr.tags).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const weekStats = getWeekStats(curr.dayStats);
  const maxWeek  = Math.max(...weekStats.map(w => w.total), 1);
  const maxTag   = Math.max(...topTags.map(([, c]) => c), 1);

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
  const maxTime = Math.max(...Object.values(timeSlots), 1);

  const tagRows = topTags.map(([tag, cnt], i) => {
    const prevCnt = prev.tags[tag] || 0;
    const barW = Math.round(cnt / maxTag * 130);
    return `<tr>
      <td style="color:#888;font-size:12px;width:24px">${i + 1}</td>
      <td><span style="background:#ede7f6;color:#6a1b9a;padding:2px 8px;border-radius:12px;font-size:12px">${tag}</span></td>
      <td><div style="display:inline-block;width:${barW}px;height:8px;background:#9c4dcc;border-radius:4px;vertical-align:middle;margin-right:6px;min-width:2px"></div>${cnt}건</td>
      <td style="text-align:right;white-space:nowrap">${delta(cnt, prevCnt)} 전월</td>
    </tr>`;
  }).join('');

  const weekRows = weekStats.map(w => `<tr>
    <td style="font-weight:600">${w.label}</td>
    <td>${bar(w.total, maxWeek, '#7c3aed')}</td>
    <td style="text-align:right;color:#1a73e8;font-size:12px">🤖 ${w.alf}건 (${pct(w.alf, w.total)})</td>
  </tr>`).join('');

  const timeRows = Object.entries(timeSlots).map(([slot, cnt]) => {
    const isMax = cnt === maxTime;
    return `<tr>
      <td style="font-weight:${isMax ? 'bold' : 'normal'};color:${isMax ? '#d93025' : '#333'}">${slot}</td>
      <td>${bar(cnt, maxTime, isMax ? '#d93025' : '#9c4dcc')}</td>
    </tr>`;
  }).join('');

  const noData = '<div style="text-align:center;padding:20px;color:#999;font-size:13px;background:#f8f9fa;border-radius:8px">데이터 누적 중이에요 📦</div>';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#f5f5f5}
  .container{background:white;margin:20px;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:linear-gradient(135deg,#6a1b9a,#1565c0);color:white;padding:24px}
  .header h1{margin:0;font-size:20px}
  .header p{margin:6px 0 0;opacity:.85;font-size:13px}
  .summary{display:flex;gap:12px;padding:20px;background:#f8f9fa;flex-wrap:wrap}
  .stat{flex:1;min-width:120px;background:white;border-radius:8px;padding:16px;text-align:center;border:1px solid #e0e0e0}
  .stat .num{font-size:28px;font-weight:bold}
  .stat .sub{font-size:11px;margin-top:2px}
  .stat .label{font-size:11px;color:#666;margin-top:4px}
  .section{padding:20px;border-top:1px solid #f0f0f0}
  .section h2{font-size:15px;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #ede7f6}
  .two-col{display:flex;gap:16px}
  .two-col>div{flex:1}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f3e5f5;padding:8px 12px;text-align:left;color:#6a1b9a;font-weight:600}
  td{padding:8px 12px;border-bottom:1px solid #f0f0f0}
  tr:last-child td{border-bottom:none}
  .alf-box{background:#e8f5e9;border-radius:8px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:16px}
  .alf-big{font-size:40px;font-weight:bold;color:#34a853}
  .time-box{display:flex;gap:12px;margin-bottom:16px}
  .time-card{flex:1;background:#f3e5f5;border-radius:8px;padding:16px;text-align:center}
  .time-card .t{font-size:24px;font-weight:bold;color:#6a1b9a}
  .time-card .l{font-size:12px;color:#666;margin-top:4px}
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>📈 월간 CS 리포트</h1>
    <p>집계 기간: ${ranges.monthLabel} (${ranges.firstDay.toISOString().slice(0,10)} ~ ${ranges.lastDay.toISOString().slice(0,10)})</p>
  </div>
  <div class="summary">
    <div class="stat">
      <div class="num" style="color:#6a1b9a">${curr.total}</div>
      <div class="sub">${delta(curr.total, prev.total)} 전월 대비</div>
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
      <div class="sub">${delta(curr.pending, prev.pending)} 전월 대비</div>
      <div class="label">⏳ 미처리</div>
    </div>
  </div>
  ${curr.avgWaitSec || curr.avgReplySec ? `
  <div class="section">
    <h2>⏱️ 평균 응답 시간</h2>
    <div class="time-box">
      <div class="time-card">
        <div class="t">${fmtTime(curr.avgWaitSec)}</div>
        <div class="l">평균 첫 응답 대기 시간</div>
        <div style="font-size:11px;color:#888;margin-top:4px">전월: ${fmtTime(prev.avgWaitSec)}</div>
      </div>
      <div class="time-card">
        <div class="t">${fmtTime(curr.avgReplySec)}</div>
        <div class="l">평균 답변 시간</div>
        <div style="font-size:11px;color:#888;margin-top:4px">전월: ${fmtTime(prev.avgReplySec)}</div>
      </div>
    </div>
  </div>` : ''}
  <div class="section">
    <h2>🏷️ VOC 카테고리 TOP 10</h2>
    ${topTags.length > 0 ? `<table>
      <tr><th>#</th><th>카테고리</th><th>건수</th><th style="text-align:right">전월 대비</th></tr>
      ${tagRows}
    </table>` : noData}
  </div>
  <div class="section">
    <h2>📅 주차별 트렌드</h2>
    ${weekStats.length > 0 ? `<table>
      <tr><th>주차</th><th>총 문의</th><th style="text-align:right">AI 처리</th></tr>
      ${weekRows}
    </table>` : noData}
  </div>
  <div class="section">
    <h2>🕐 시간대별 문의 분포</h2>
    ${Object.values(timeSlots).some(v => v > 0) ? `<table>
      <tr><th>시간대</th><th>건수</th></tr>
      ${timeRows}
    </table>` : noData}
  </div>
  <div class="section">
    <h2>🤖 AI(ALF) 월간 성과</h2>
    <div class="alf-box">
      <div class="alf-big">${pct(curr.alf + curr.workflow, curr.total)}</div>
      <div>
        <div style="font-size:14px;font-weight:bold;color:#1b5e20">AI 자동 처리율</div>
        <div style="font-size:12px;color:#555;margin-top:4px">전체 ${curr.total}건 중 ${curr.alf + curr.workflow}건을 AI가 처리했어요</div>
        <div style="font-size:12px;color:#888;margin-top:2px">전월 AI 처리율: ${pct(prev.alf + prev.workflow, prev.total)}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

async function run() {
  const ranges = getMonthRange();
  const currDays = loadRange(ranges.firstDay.getTime(), ranges.lastDay.getTime());
  const prevDays = loadRange(ranges.prevFirst.getTime(), ranges.prevLast.getTime());

  const curr = mergeStats(currDays);
  const prev = mergeStats(prevDays);
  const html = buildReport(curr, prev, ranges);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  await transporter.sendMail({
    from: `클로버 리포트 <${GMAIL_USER}>`,
    to: GMAIL_USER,
    subject: `📈 [페이쌤] 월간 CS 리포트 | ${ranges.monthLabel} (총 ${curr.total}건)`,
    html
  });

  console.log(`✅ 월간 리포트 발송 완료 | ${ranges.monthLabel} | ${curr.total}건`);
}

module.exports = { run };
