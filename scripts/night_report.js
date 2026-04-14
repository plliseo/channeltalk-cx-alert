/**
 * 🌙 야간 문의 리포트
 * - 월요일: 금요일 13:00 ~ 월요일 09:30 (주말 포함)
 * - 화~금: 전일 18:00 ~ 당일 09:30
 */

const nodemailer = require('nodemailer');
const { saveDay, summarizeChats } = require('./saveData');

const CT_KEY    = process.env.CT_KEY;
const CT_SECRET = process.env.CT_SECRET;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
const KST = 9 * 3600000;

function getTimeRange() {
  const now = new Date();
  const todayKST = new Date(now.getTime() + KST);
  const dayOfWeek = todayKST.getUTCDay();

  const todayOpen = new Date(Date.UTC(
    todayKST.getUTCFullYear(), todayKST.getUTCMonth(), todayKST.getUTCDate(), 0, 30
  ));

  let sinceTime, rangeLabel;

  if (dayOfWeek === 1) {
    const lastFriday = new Date(todayOpen.getTime() - 3 * 24 * 3600000);
    sinceTime = new Date(Date.UTC(
      lastFriday.getUTCFullYear(), lastFriday.getUTCMonth(), lastFriday.getUTCDate(), 4, 0
    ));
    const sinceLabel = new Date(sinceTime.getTime() + KST);
    rangeLabel = `${sinceLabel.getUTCMonth()+1}/${sinceLabel.getUTCDate()} 13:00 → 오늘 09:30 (주말 포함)`;
  } else {
    const yesterday = new Date(todayOpen.getTime() - 24 * 3600000);
    sinceTime = new Date(Date.UTC(
      yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 9, 0
    ));
    const sinceLabel = new Date(sinceTime.getTime() + KST);
    rangeLabel = `${sinceLabel.getUTCMonth()+1}/${sinceLabel.getUTCDate()} 18:00 → 오늘 09:30`;
  }

  return { since: sinceTime.getTime(), until: todayOpen.getTime(), rangeLabel };
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
  return `${d.getUTCMonth()+1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

function tagStyle(tags) {
  return (tags || [])
    .filter(t => t !== '중복방지')
    .map(t => `<span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:12px;font-size:12px;margin-right:4px">${t}</span>`)
    .join('');
}

function buildReport(chats, rangeLabel) {
  const withManager = chats.filter(c => c.managerIds?.length > 0);
  const autoOnly    = chats.filter(c => !c.managerIds?.length && c.state === 'closed');
  const needAction  = chats.filter(c => c.state === 'opened');
  const resolved    = withManager.filter(c => c.state === 'closed');

  const alfAuto   = autoOnly.filter(c => c.handling?.type === 'alf');
  const wfAuto    = autoOnly.filter(c => c.handling?.type === 'workflow');
  const otherAuto = autoOnly.filter(c => c.handling?.type !== 'alf' && c.handling?.type !== 'workflow');

  const tagCount = {};
  withManager.forEach(c => (c.tags || []).forEach(t => {
    if (t !== '중복방지') tagCount[t] = (tagCount[t] || 0) + 1;
  }));
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const needRows = needAction.sort((a,b) => a.createdAt - b.createdAt).map(c =>
    `<tr><td style="white-space:nowrap">${formatKST(c.createdAt)}</td><td>${tagStyle(c.tags)}</td><td>${c.name || '-'}</td></tr>`
  ).join('');

  const resolvedRows = resolved.sort((a,b) => a.createdAt - b.createdAt).map(c =>
    `<tr><td style="white-space:nowrap">${formatKST(c.createdAt)}</td><td>${tagStyle(c.tags)}</td><td>${c.name || '-'}</td></tr>`
  ).join('');

  const topTagRows = topTags.map(([tag, cnt], i) =>
    `<tr><td>${i+1}위</td><td><span style="background:#e8f0fe;color:#1a73e8;padding:2px 8px;border-radius:12px;font-size:12px">${tag}</span></td><td>${cnt}건</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#f5f5f5}
  .container{background:white;margin:20px;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  .header{background:#1a73e8;color:white;padding:24px}
  .header h1{margin:0;font-size:20px}
  .header p{margin:6px 0 0;opacity:.85;font-size:13px}
  .summary{display:flex;gap:12px;padding:20px;background:#f8f9fa;flex-wrap:wrap}
  .stat{flex:1;min-width:100px;background:white;border-radius:8px;padding:16px;text-align:center;border:1px solid #e0e0e0}
  .stat .num{font-size:26px;font-weight:bold}
  .stat .label{font-size:11px;color:#666;margin-top:4px}
  .section{padding:20px;border-top:1px solid #f0f0f0}
  .section h2{font-size:15px;margin:0 0 12px}
  .auto-box{background:#f8f9fa;border-radius:8px;padding:14px 16px;font-size:13px;color:#555;display:flex;gap:20px;flex-wrap:wrap}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f8f9fa;padding:8px 12px;text-align:left;color:#555;font-weight:600}
  td{padding:8px 12px;border-bottom:1px solid #f0f0f0}
  tr:last-child td{border-bottom:none}
</style>
</head><body>
<div class="container">
  <div class="header">
    <h1>🌙 야간 문의 리포트</h1>
    <p>수집 기간: ${rangeLabel}</p>
  </div>
  <div class="summary">
    <div class="stat"><div class="num" style="color:#333">${chats.length}</div><div class="label">📨 총 문의</div></div>
    <div class="stat"><div class="num" style="color:#d93025">${needAction.length}</div><div class="label">🔴 응대 필요</div></div>
    <div class="stat"><div class="num" style="color:#34a853">${resolved.length}</div><div class="label">✅ 야간 처리 완료</div></div>
    <div class="stat"><div class="num" style="color:#888">${autoOnly.length}</div><div class="label">🤖 자동 처리</div></div>
  </div>
  ${needAction.length > 0 ? `
  <div class="section">
    <h2>🔴 지금 바로 확인 필요 (${needAction.length}건)</h2>
    <table>
      <tr><th>인입 시간</th><th>카테고리</th><th>고객명</th></tr>
      ${needRows}
    </table>
  </div>` : `
  <div class="section">
    <h2>🔴 응대 필요 문의</h2>
    <p style="color:#34a853;margin:0">✅ 야간 미해결 문의 없음</p>
  </div>`}
  ${resolved.length > 0 ? `
  <div class="section">
    <h2>✅ 야간 처리 완료 (${resolved.length}건)</h2>
    <table>
      <tr><th>인입 시간</th><th>카테고리</th><th>고객명</th></tr>
      ${resolvedRows}
    </table>
  </div>` : ''}
  <div class="section">
    <h2>🤖 이민트 자동 처리 (${autoOnly.length}건)</h2>
    <div class="auto-box">
      <span>🤖 ALF 완료 <strong>${alfAuto.length}건</strong></span>
      <span>⚙️ 워크플로우 <strong>${wfAuto.length}건</strong></span>
      ${otherAuto.length > 0 ? `<span>기타 <strong>${otherAuto.length}건</strong></span>` : ''}
    </div>
  </div>
  ${topTags.length > 0 ? `
  <div class="section">
    <h2>🏷️ 야간 TOP 문의 유형</h2>
    <table>
      <tr><th>순위</th><th>카테고리</th><th>건수</th></tr>
      ${topTagRows}
    </table>
  </div>` : ''}
</div>
</body></html>`;
}

async function run() {
  const { since, until, rangeLabel } = getTimeRange();
  const chats = await fetchChats(since, until);

  const todayKST = new Date(new Date().getTime() + KST);
  const todayStr = `${todayKST.getUTCFullYear()}-${String(todayKST.getUTCMonth()+1).padStart(2,'0')}-${String(todayKST.getUTCDate()).padStart(2,'0')}`;

  const html = buildReport(chats, rangeLabel);

  saveDay(todayStr, 'overnight', summarizeChats(chats));

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  await transporter.sendMail({
    from: `클로버 리포트 <${GMAIL_USER}>`,
    to: GMAIL_USER,
    subject: `🌙 [페이쌤] 야간 문의 리포트 | ${todayStr} (상담원 개입 ${chats.filter(c=>c.managerIds?.length>0).length}건 / 총 ${chats.length}건)`,
    html
  });

  console.log(`✅ 야간 리포트 발송 완료 | ${todayStr} | 총 ${chats.length}건`);
}

module.exports = { run };
