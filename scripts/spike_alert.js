/**
 * 🚨 장애 키워드 급증 알림 - Slack 웹훅 발송
 * - 5분마다 실행 (index.js에서 node-cron으로 호출)
 * - 최근 5분 내 생성된 채팅의 첫 메시지에 장애 키워드 포함 건이 7건 이상이면 Slack 알림
 * - 10분 쿨다운 (중복 알림 방지)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ACCESS_KEY       = process.env.CT_KEY;
const ACCESS_SECRET    = process.env.CT_SECRET;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const WINDOW_MS   = 5 * 60 * 1000;
const THRESHOLD   = 7;
const COOLDOWN_MS = 10 * 60 * 1000;
const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE  = path.join(DATA_DIR, 'spike_state.json');
const KST         = 9 * 3600000;

const SERVICE_WORDS = [
  '결제', '앱', '접속', '로그인', '결제선생',
  '사이트', '홈페이지', '화면', '페이지'
];

const FAILURE_WORDS = [
  '안되', '안돼', '안됨', '안됩니다', '안되요', '안돼요',
  '안 됩', '안 돼', '안 되',
  '오류', '에러', 'error', '실패',
  '안열려', '안 열려', '열리지 않', '열리지않',
  '들어가지', '안들어가', '안 들어가',
  '튕김', '튕겨', '실행이 안', '연결이 안'
];

const STANDALONE_KEYWORDS = ['먹통', '장애', '접속 불가', '접속불가'];

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {}
  return { lastAlertAt: 0 };
}

function saveState(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchChatsPage(page) {
  const res = await httpsRequest(
    `https://api.channel.io/open/v5/user-chats?page=${page}&limit=200&sortOrder=desc`,
    { headers: { 'x-access-key': ACCESS_KEY, 'x-access-secret': ACCESS_SECRET } }
  );
  return JSON.parse(res.body);
}

async function fetchChatMessages(userChatId) {
  try {
    const res = await httpsRequest(
      `https://api.channel.io/open/v5/user-chats/${userChatId}/messages?limit=5&sortOrder=asc`,
      { headers: { 'x-access-key': ACCESS_KEY, 'x-access-secret': ACCESS_SECRET } }
    );
    return JSON.parse(res.body).messages || [];
  } catch (e) {
    return [];
  }
}

function detectFailure(text) {
  if (!text) return { matched: false, keywords: [] };
  const lower = text.toLowerCase();
  const found = [];

  for (const kw of STANDALONE_KEYWORDS) {
    if (lower.includes(kw)) found.push(kw);
  }

  const hasService = SERVICE_WORDS.find(sw => lower.includes(sw));
  const hasFailure = FAILURE_WORDS.find(fw => lower.includes(fw.toLowerCase()));
  if (hasService && hasFailure) {
    found.push(`${hasService}+${hasFailure}`);
  }

  return { matched: found.length > 0, keywords: found };
}

async function getRecentChats() {
  const cutoff = Date.now() - WINDOW_MS;
  const recentChats = [];

  for (let page = 0; page < 5; page++) {
    const data = await fetchChatsPage(page);
    const chats = data.userChats || [];
    if (!chats.length) break;

    for (const chat of chats) {
      if ((chat.createdAt || 0) >= cutoff) recentChats.push(chat);
    }

    const oldest = Math.min(...chats.map(c => c.createdAt || 0));
    if (oldest < cutoff) break;
  }

  return recentChats;
}

async function filterByKeyword(chats) {
  const matched = [];

  for (const chat of chats) {
    const messages = await fetchChatMessages(chat.id || chat.userChatId);
    const customerMessages = messages.filter(m => m.personType === 'user' || !m.personType);
    const allText = customerMessages.map(m => m.plainText || m.text || '').join(' ');

    const { matched: isMatch, keywords } = detectFailure(allText);
    if (isMatch) {
      matched.push({ chat, keywords, preview: allText.slice(0, 50) });
    }
  }

  return matched;
}

async function sendSlackAlert(matchedChats, totalRecent) {
  const nowKST = new Date(Date.now() + KST);
  const timeStr = `${String(nowKST.getUTCHours()).padStart(2, '0')}:${String(nowKST.getUTCMinutes()).padStart(2, '0')}`;

  const count    = matchedChats.length;
  const alfCount = matchedChats.filter(({ chat: c }) => c.handling?.type === 'alf').length;

  const kwCount = {};
  matchedChats.forEach(({ keywords }) => {
    keywords.forEach(kw => { kwCount[kw] = (kwCount[kw] || 0) + 1; });
  });
  const topKw = Object.entries(kwCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const kwStr = topKw.map(([kw, c]) => `\`${kw}\` ${c}건`).join('  ');

  const message = {
    text: `🚨 장애 의심 — ${timeStr} 기준 5분 내 장애 키워드 ${count}건 감지`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🚨 장애 의심 알림', emoji: true } },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${timeStr}* 기준 최근 5분 내 장애 관련 문의가 *${count}건* 감지됐어요.\n장애 여부를 확인해주세요.`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*🔴 장애 키워드 문의*\n${count}건` },
          { type: 'mrkdwn', text: `*🤖 AI(ALF) 포함*\n${alfCount}건` },
          { type: 'mrkdwn', text: `*📨 전체 신규 문의*\n${totalRecent}건` }
        ]
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*🔑 감지된 키워드:*  ${kwStr}` } }
    ]
  };

  const res = await httpsRequest(
    SLACK_WEBHOOK_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify(message)
  );

  if (res.status !== 200) {
    throw new Error(`Slack 응답 오류: ${res.status} ${res.body}`);
  }
}

async function run() {
  const state = loadState();
  const now   = Date.now();

  const elapsed = now - state.lastAlertAt;
  if (elapsed < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
    console.log(`⏸️  쿨다운 중 — 다음 알림 가능까지 약 ${remaining}분`);
    return;
  }

  console.log('🔍 최근 5분 문의 조회 중...');
  const recentChats = await getRecentChats();
  console.log(`📋 최근 5분 신규 문의: ${recentChats.length}건`);

  if (recentChats.length === 0) {
    console.log('✅ 신규 문의 없음');
    return;
  }

  const matched = await filterByKeyword(recentChats);
  console.log(`⚡ 장애 키워드 포함: ${matched.length}건 — 임계값 ${THRESHOLD}건`);

  if (matched.length >= THRESHOLD) {
    await sendSlackAlert(matched, recentChats.length);
    saveState({ lastAlertAt: now });
    console.log(`🚨 급증 알림 발송 완료! (${matched.length}건)`);
  } else {
    console.log('✅ 정상 범위');
  }
}

module.exports = { run };
