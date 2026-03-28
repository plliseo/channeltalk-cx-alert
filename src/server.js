/**
 * 채널톡 Webhook 수신 서버
 * 페이쌤 CX파트너팀 - 상담 모니터링 시스템
 */

require('dotenv').config();
const express = require('express');
const { detectKeywords } = require('./keywords');
const { sendCXAlert, sendStartupNotice } = require('./slack');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ────────────────────────────────────────────────
// 헬스체크
// ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: '페이쌤 CX 모니터링 시스템',
    timestamp: new Date().toISOString(),
  });
});

// ────────────────────────────────────────────────
// 채널톡 Webhook 수신
// POST /webhook
// ────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  try {
    // 채널톡 Webhook 서명 검증 (선택사항)
    // const token = req.headers['x-channel-webhook-token'];
    // if (process.env.CHANNELTALK_WEBHOOK_TOKEN && token !== process.env.CHANNELTALK_WEBHOOK_TOKEN) {
    //   return res.status(401).json({ error: '인증 실패' });
    // }

    const payload = req.body;
    console.log('[Webhook 수신]', JSON.stringify(payload, null, 2));

    // ── 채널톡 Webhook 페이로드 구조 파싱 ──
    // { event: 'push', type: 'Message', entity: {...}, refers: {...} }
    const { type, entity, refers } = payload;

    // 메시지 이벤트만 처리
    if (type !== 'Message' && type !== 'UserChat') {
      return res.status(200).json({ status: 'ignored', reason: `type=${type}` });
    }

    // 고객 메시지만 처리 (상담원·봇 메시지 제외)
    const personType = entity?.personType;
    if (personType && personType !== 'user') {
      return res.status(200).json({ status: 'ignored', reason: `personType=${personType}` });
    }

    // 메시지 텍스트 추출
    const messageText = extractMessageText(entity);
    if (!messageText) {
      return res.status(200).json({ status: 'ignored', reason: 'no text' });
    }

    // ── 키워드 필터 ──
    const result = detectKeywords(messageText);
    if (!result.matched) {
      console.log('[필터링] 감지된 키워드 없음');
      return res.status(200).json({ status: 'no_match' });
    }

    // ── 고객 정보 추출 ──
    const customerName = extractCustomerName(entity, refers);
    const chatId       = entity?.chatId || entity?.id || null;
    const agentName    = extractAgentName(refers);
    const channelUrl   = chatId
      ? `https://desk.channel.io/conversations/${chatId}`
      : null;

    // ── 슬랙 알림 전송 ──
    await sendCXAlert({
      level: result.level,
      rule: result.rule,
      matchedKeywords: result.matchedKeywords,
      messageText,
      customerName,
      chatId,
      channelUrl,
      agentName,
    });

    return res.status(200).json({ status: 'alert_sent', level: result.level });

  } catch (err) {
    console.error('[Webhook 처리 오류]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────
// 테스트 엔드포인트 (개발 환경에서만 사용)
// POST /test
// ────────────────────────────────────────────────
app.post('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: '프로덕션 환경에서는 사용 불가' });
  }

  const { message = '환불 요청합니다. 법적 조치를 취할 수 있습니다.' } = req.body;

  const testPayload = {
    type: 'Message',
    entity: {
      personType: 'user',
      plainText: message,
      chatId: 'test-chat-001',
    },
    refers: {
      user: { name: '테스트 고객' },
      manager: { name: '테스트 상담원' },
    },
  };

  req.body = testPayload;
  console.log('[테스트 메시지]', message);

  // webhook 핸들러 재사용
  return app._router.handle(
    { ...req, url: '/webhook', method: 'POST', body: testPayload },
    res,
    () => {}
  );
});

// ────────────────────────────────────────────────
// 유틸 함수
// ────────────────────────────────────────────────
function extractMessageText(entity) {
  return (
    entity?.plainText ||
    entity?.text ||
    entity?.content?.text ||
    entity?.blocks?.find(b => b.type === 'text')?.value ||
    null
  );
}

function extractCustomerName(entity, refers) {
  return (
    refers?.user?.name ||
    refers?.contact?.name ||
    entity?.userName ||
    entity?.personId ||
    '(이름 없음)'
  );
}

function extractAgentName(refers) {
  return refers?.manager?.name || refers?.bot?.name || null;
}

// ────────────────────────────────────────────────
// 서버 시작
// ────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n✅ CX 모니터링 서버 시작`);
  console.log(`   포트: ${PORT}`);
  console.log(`   Webhook URL: http://서버주소:${PORT}/webhook`);
  console.log(`   테스트 URL: POST http://localhost:${PORT}/test\n`);

  // 슬랙 시작 알림 (토큰이 있을 때만)
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) {
    await sendStartupNotice();
  } else {
    console.warn('⚠️  SLACK_BOT_TOKEN 또는 SLACK_CHANNEL_ID가 설정되지 않았습니다.');
    console.warn('   .env 파일을 확인해주세요.\n');
  }
});

module.exports = app;
