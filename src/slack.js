/**
 * Slack 알림 전송 모듈
 * 페이쌤 CX파트너팀 - 상담 모니터링 시스템
 */

const { WebClient } = require('@slack/web-api');

let slackClient = null;

function getSlackClient() {
  if (!slackClient) {
    if (!process.env.SLACK_BOT_TOKEN) {
      throw new Error('SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.');
    }
    slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return slackClient;
}

/**
 * CX 알림 슬랙 메시지 전송
 * @param {object} params
 * @param {string} params.level         - 심각도 (critical|warning|error|notice)
 * @param {object} params.rule          - 키워드 룰 객체
 * @param {string[]} params.matchedKeywords - 매칭된 키워드 목록
 * @param {string} params.messageText   - 원본 메시지 텍스트
 * @param {string} params.customerName  - 고객 이름
 * @param {string} params.chatId        - 채널톡 채팅 ID
 * @param {string} params.channelUrl    - 채널톡 바로가기 URL (옵션)
 * @param {string} params.agentName     - 담당 상담원 이름 (옵션)
 */
async function sendCXAlert({
  level,
  rule,
  matchedKeywords,
  messageText,
  customerName = '알 수 없음',
  chatId,
  channelUrl,
  agentName,
}) {
  const client = getSlackClient();
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!channelId) {
    throw new Error('SLACK_CHANNEL_ID 환경변수가 설정되지 않았습니다.');
  }

  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  // 메시지 미리보기 (80자 제한)
  const preview = messageText
    ? (messageText.length > 80 ? messageText.slice(0, 80) + '...' : messageText)
    : '(내용 없음)';

  // 감지된 키워드 포맷
  const keywordTags = matchedKeywords.map(k => `\`${k}\``).join(' ');

  // 채널톡 링크
  const chatLink = channelUrl
    ? `<${channelUrl}|채널톡 바로가기 →>`
    : chatId
      ? `채팅 ID: \`${chatId}\``
      : '링크 없음';

  // Slack Block Kit 메시지
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${rule.emoji} [CX 알림] ${rule.label} 상담 감지`,
        emoji: true,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*📌 등급*\n${rule.emoji} ${rule.label}`,
        },
        {
          type: 'mrkdwn',
          text: `*👤 고객*\n${customerName}`,
        },
        {
          type: 'mrkdwn',
          text: `*🔑 감지 키워드*\n${keywordTags}`,
        },
        {
          type: 'mrkdwn',
          text: `*⏰ 감지 시간*\n${now}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💬 메시지 미리보기*\n> ${preview}`,
      },
    },
    ...(agentName ? [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🎧 담당 상담원*\n${agentName}`,
      },
    }] : []),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔗 상담 링크*\n${chatLink}`,
      },
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '🤖 페이쌤 CX파트너팀 자동 모니터링 시스템',
        },
      ],
    },
  ];

  // fallback 텍스트 (알림 미리보기용)
  const text = `${rule.emoji} [CX 알림] ${rule.label} | 고객: ${customerName} | 키워드: ${matchedKeywords.join(', ')}`;

  await client.chat.postMessage({
    channel: channelId,
    text,
    attachments: [
      {
        color: rule.color,
        blocks,
      },
    ],
  });

  console.log(`[슬랙 전송 완료] ${rule.label} | 고객: ${customerName} | 키워드: ${matchedKeywords.join(', ')}`);
}

/**
 * 서버 시작 알림 전송
 */
async function sendStartupNotice() {
  try {
    const client = getSlackClient();
    await client.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: '✅ *CX 모니터링 시스템 시작*\n채널톡 상담 실시간 감지를 시작합니다.',
    });
  } catch (err) {
    console.warn('[슬랙 시작 알림 실패]', err.message);
  }
}

module.exports = { sendCXAlert, sendStartupNotice };
