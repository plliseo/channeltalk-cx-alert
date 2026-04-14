/**
 * 📋 일일 문의 리포트
 * - 월~목: 당일 09:30 ~ 18:00 + 야간 미처리 건 현황
 * - 금: 당일 09:30 ~ 13:00 + 야간 미처리 건 현황
 */

const nodemailer = require('nodemailer');
const { saveDay, summarizeChats } = require('./saveData');

const CT_KEY    = process.env.CT_KEY;
const CT_SECRET = process.env.CT_SECRET;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
const KST = 9 * 3600000;

function getTimeRanges(isFridayMode = false) {
  const now = new Date();
  let targetKST = new Date(now.getTime() + KST);

  if (isFridayMode) {
    const dow = targetKST.getUTCDay();
    const backMap = { 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 0, 6: 1 };
    targetKST = new Date(targetKST.getTime() - backMap[dow] * 24 * 3600000);
  }

  const dayOfWeek = isFridayMode ? 5 : targetKST.getUTCDay();
  const y = targetKST.getUTCFullYear();
  const m = targetKST.getUTCMonth();
  const d = targetKST.getUTCDate();

  const dayOpen  = new Date(Date.UTC(y, m, d, 0, 30));
  const dayClose = dayOfWeek === 5
    ? new Date(Date.UTC(y, m, d, 4, 0))
    : new Date(Date.UTC(y, m, d, 9, 0));

  let nightSince;
  if (dayOfWeek === 1) {
    const friday = new Date(dayOpen.getTime() - 3 * 24 * 3600000);
    nightSince = new Date(Date.UTC(friday.getUTCFullYear(), friday.getUTCMonth(), friday.getUTCDate(), 4, 0));
  } else {
    const yesterday = new Date(dayOpen.getTime() - 24 * 3600000);
    nightSince = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 9, 0));
  }

  const closeLabel = dayOfWeek === 5 ? '13:00' : '18:00';
  const todayStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  return {
    daySince: dayOpen.getTime(),
    dayUntil: dayClose.getTime(),
    nightSince: nightSince.getTime(),
    nightUntil: dayOpen.getTime(),
    closeLabel,
    todayStr
  };
}

async function fetchChats(since, until) {
  const headers = { 'x-access-key': CT_KEY, 'x-access-secret': CT_SECRET };
  const allChats = [];

  for (const state of ['opened', 'closed']) {
    let page = 0;
    while (page < 15) {
      const res = await fetch(
        `https://api.channel.io/open/v5/user-chats?limit=200&state=${state}&page=${page}`,
        { headers }
      ).then(r => r.json());

      const chats = res.userChats || [];
      if (chats.length === 0) break;

      allChats.push(...chats);

      const oldestUpdatedAt = Math.min(...chats.map(c => c.updatedAt || c.createdAt || 0));
      if (oldestUpdatedAt < since) break;

      page++;
    }
  }

  const uniqueChats = Object.values(
    allChats.reduce((acc, c) => {
      if (!acc[c.id] || c.updatedAt > acc[c.id].updatedAt) acc[c.id] = c;
      return acc;
    }, {})
  );

  return uniqueChats.filter(c => c.createdAt >= since && c.createdAt <= until);
}

function formatKST(ts) {
  const d = new Date(ts + KST);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

function formatDateKST(ts) {
  const d = new Date(ts + KST);
  return `${d.getUTCMonth()+1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

function isAIHandled(chat) {
  return chat.state === 'closed' &&
         chat.source?.workflow?.causeOfEnd === 'endWithoutError';
}

function getHandlingLabel(chat) {
  if (chat.state === 'opened') return `<span style="background:#fce8e6;color:#d93025;padding:2px 8px;border-radius:12px;font-size:12px">⏳ 미처리</span>`;
  if (isAIHandled(chat)) return `<span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:12px;font-size:12px">🤖 AI</span>`;
  return `<span style="background:#e6f4ea;color:#34a853;padding:2px 8px;border-radius:12px;font-size:12px">✅ 완료</span>`;
}

function tagStyle(tags) {
  return (tags || []).filter(t => t !== '중복방지')
    .map(t => `<span style="background:#e6f4ea;color:#34a853;padding:2px 8px;border-radius:12px;font-size:12px;margin-right:4px">${t}</span>`)
    .join('');
}

function tagStyleNight(tags) {
  return (tags || []).filter(t => t !== '중복방지')
    .map(t => `<span style="background:#f3e8ff;color:#9334e6;padding:2px 8px;border-radius:12px;font-size:12px;margin-right:4px">${t}</span>`)
    .join('');
}

function buildReport(dayChats, nightChats, ranges) {
  const { closeLabel, todayStr } = ranges;

  const dayPending = dayChats.filter(c => c.state === 'opened');
  const dayALF    = dayChats.filter(c => isAIHandled(c));
  const dayDone   = dayChats.filter(c => c.state === 'closed' && !isAIHandled(c));

  const nightResolved = nightChats.filter(c => c.state === 'closed' && !isAIHandled(c));
  const nightALF      = nightChats.filter(c => isAIHandled(c));
  const nightPending  = nightChats.filter(c => c.state === 'opened');

  const tagCount = {};
  dayChats.forEach(c => (c.tags || []).forEach(t => {
    if (t !== '중복방지') tagCount[t] = (tagCount[t] || 0) + 1;
  }));
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const dayRows = dayChats.sort((a,b) => a.createdAt - b.createdAt).map(c =>
    `<tr><td>${formatKST(c.createdAt)}</td><td>${tagStyle(c.tags)}</td><td>${c.name || '-'}</td><td>${getHandlingLabel(c)}</td></tr>`
  ).join('');

  const nightRows = nightChats.sort((a,b) => a.createdAt - b.createdAt).map(c =>
    `<tr><td>${formatDateKST(c.createdAt)}</td><td>${tagStyleNight(c.tags)}</td><td>${c.name || '-'}</td><td>${getHandlingLabel(c)}</td></tr>`
  ).join('');

  const topTagRows = topTags.map(([tag, cnt], i) =>
    `<tr><td>${i+1}위</td><td><span style="background:#e6f4ea;color:#34a853;padding:2px 8px;border-radius:12px;font-size:12px">${tag}</span></td><td>${cnt}건</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f5f5f5}
  .container{background:white;margin:20px;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:#34a853;color:white;padding:24px}
  .header h1{margin:0;font-size:20px}
  .header p{margin:6px 0 0;opacity:.85;font-size:13px}
  .summary{display:flex;gap:12px;padding:20px;background:#f8f9fa;flex-wrap:wrap}
  .stat{flex:1;min-width:100px;background:white;border-radius:8px;padding:16px;text-align:center;border:1px solid #e0e0e0}
  .stat .num{font-size:26px;font-weight:bold}
  .stat .label{font-size:11px;color:#666;margin-top:4px}
  .section{padding:20px;border-top:1px solid #f0f0f0}
  .section h2{font-size:15px;margin:0 0 12px}
  .section-night{background:#f8f4ff;border-left:4px solid #9334e6;padding:16px 20px;border-top:1px solid #f0f0f0}
  .section-night h2{font-size:15px;margin:0 0 12px;color:#9334e6}
  .night-summary{display:flex;gap:10px;margin-bottom:14px}
  .night-stat{flex:1;background:white;border-radius:8px;padding:12px;text-align:center;border:1px solid #e8d5ff}
  .night-stat .num{font-size:22px;font-weight:bold}
  .night-stat .label{font-size:11px;color:#666;margin-top:3px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f8f9fa;padding:8px 12px;text-align:left;color:#555;font-weight:600}
  td{padding:8px 12px;border-bottom:1px solid #f0f0f0}
  tr:last-child td{border-bottom:none}
  .footer{padding:16px 20px;font-size:12px;color:#999;text-align:center;border-top:1px solid #f0f0f0}
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>📋 일일 문의 리포트</h1>
    <p>수집 기간: ${todayStr} 09:30 → ${closeLabel}</p>
  </div>
  <div class="summary">
    <div class="stat"><div class="num" style="color:#333">${dayChats.length}</div><div class="label">📨 금일 신규</div></div>
    <div class="stat"><div class="num" style="color:#34a853">${dayDone.length}</div><div class="label">✅ 처리 완료</div></div>
    <div class="stat"><div class="num" style="color:#1a73e8">${dayALF.length}</div><div class="label">🤖 AI 완료</div></div>
    <div class="stat"><div class="num" style="color:#f29900">${dayPending.length}</div><div class="label">⏳ 미처리</div></div>
  </div>
  <div class="section">
    <h2>📨 금일 신규 문의 (${dayChats.length}건)</h2>
    <table>
      <tr><th>시간</th><th>카테고리</th><th>고객명</th><th>처리</th></tr>
      ${dayRows || '<tr><td colspan="4" style="text-align:center;color:#999">문의 없음</td></tr>'}
    </table>
  </div>
  ${nightChats.length > 0 ? `
  <div class="section-night">
    <h2>🌙 야간 미처리 건 처리 현황 (${nightChats.length}건)</h2>
    <div class="night-summary">
      <div class="night-stat"><div class="num" style="color:#34a853">${nightResolved.length}</div><div class="label">✅ 오늘 처리 완료</div></div>
      <div class="night-stat"><div class="num" style="color:#1a73e8">${nightALF.length}</div><div class="label">🤖 AI 완료</div></div>
      <div class="night-stat"><div class="num" style="color:#d93025">${nightPending.length}</div><div class="label">⏳ 여전히 미처리</div></div>
    </div>
    <table>
      <tr><th>인입시간</th><th>카테고리</th><th>고객명</th><th>처리</th></tr>
      ${nightRows}
    </table>
  </div>` : ''}
  ${topTags.length > 0 ? `
  <div class="section">
    <h2>🏷️ 오늘 TOP 문의 유형</h2>
    <table>
      <tr><th>순위</th><th>카테고리</th><th>건수</th></tr>
      ${topTagRows}
    </table>
  </div>` : ''}
</div>
</body></html>`;
}

async function run({ friday = false } = {}) {
  const ranges = getTimeRanges(friday);

  const [dayChats, allNightChats] = await Promise.all([
    fetchChats(ranges.daySince, ranges.dayUntil),
    fetchChats(ranges.nightSince, ranges.nightUntil)
  ]);

  const html = buildReport(dayChats, allNightChats, ranges);

  saveDay(ranges.todayStr, 'business', summarizeChats(dayChats));

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  await transporter.sendMail({
    from: `클로버 리포트 <${GMAIL_USER}>`,
    to: GMAIL_USER,
    subject: `📋 [페이쌤] 일일 문의 리포트 | ${ranges.todayStr} (신규 ${dayChats.length}건)`,
    html
  });

  console.log(`✅ 일일 리포트 발송 완료 | ${ranges.todayStr} | 신규 ${dayChats.length}건`);
}

module.exports = { run };
