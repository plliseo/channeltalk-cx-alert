/**
 * 📦 일별 데이터 저장/불러오기 모듈
 */

const fs = require('fs');
const path = require('path');

// Railway 볼륨 마운트 경로 또는 로컬 data 폴더 사용
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function getFilePath(dateStr) {
  return path.join(DATA_DIR, `${dateStr}.json`);
}

function loadDay(dateStr) {
  const filePath = getFilePath(dateStr);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return { date: dateStr, overnight: null, business: null };
}

function saveDay(dateStr, type, stats) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const data = loadDay(dateStr);
  data[type] = stats;
  fs.writeFileSync(getFilePath(dateStr), JSON.stringify(data, null, 2), 'utf8');
}

function loadRange(since, until) {
  const results = [];
  const cur = new Date(since);
  while (cur.getTime() <= until) {
    const dateStr = cur.toISOString().slice(0, 10);
    const data = loadDay(dateStr);
    if (data.overnight || data.business) results.push(data);
    cur.setDate(cur.getDate() + 1);
  }
  return results;
}

function loadWeek(since, until) {
  return loadRange(since, until);
}

function summarizeChats(chats) {
  const tagCount = {};
  const hourCount = {};
  let totalWaitMs = 0, waitCount = 0;
  let totalReplyMs = 0, replyCount = 0;

  chats.forEach(c => {
    (c.tags || []).forEach(t => {
      if (t !== '중복방지') tagCount[t] = (tagCount[t] || 0) + 1;
    });
    const h = new Date(c.createdAt + 9 * 3600000).getUTCHours();
    hourCount[h] = (hourCount[h] || 0) + 1;

    if (c.waitingTime && c.waitingTime > 0 && c.waitingTime < 86400000) {
      totalWaitMs += c.waitingTime;
      waitCount++;
    }
    if (c.avgReplyTime && c.avgReplyTime > 0 && c.avgReplyTime < 86400000) {
      totalReplyMs += c.avgReplyTime;
      replyCount++;
    }
  });

  return {
    total: chats.length,
    alf: chats.filter(c => c.handling?.type === 'alf').length,
    workflow: chats.filter(c => c.handling?.type === 'workflow').length,
    humanDone: chats.filter(c => c.state === 'closed' && !c.handling?.type).length,
    pending: chats.filter(c => c.state === 'opened').length,
    tags: tagCount,
    hourly: hourCount,
    avgWaitSec: waitCount > 0 ? Math.round(totalWaitMs / waitCount / 1000) : null,
    avgReplySec: replyCount > 0 ? Math.round(totalReplyMs / replyCount / 1000) : null
  };
}

module.exports = { saveDay, loadDay, loadWeek, loadRange, summarizeChats };
