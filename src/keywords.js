/**
 * CX 알림 키워드 정의 및 필터 로직
 * 페이쌤 CX파트너팀 - 상담 모니터링 시스템
 */

const KEYWORD_RULES = [
  {
    level: 'critical',       // 🔴 심각
    emoji: '🔴',
    label: '심각',
    color: '#E53E3E',
    keywords: [
      '환불', '환불요청', '환불해주', '환불해달',
      '법적', '법적조치', '법적대응', '소비자원', '공정위', '고소', '고발',
      '신고', '민원', '집단소송',
      '사기', '먹튀', '피해',
    ],
  },
  {
    level: 'warning',        // 🟠 불만
    emoji: '🟠',
    label: '고객 불만',
    color: '#ED8936',
    keywords: [
      '짜증', '화나', '화남', '열받', '욱', '분노',
      '최악', '불만', '실망', '엉망', '형편없', '최하',
      '어이없', '황당', '기분나쁨', '기분나빠',
      '왜이래', '왜 이러', '대체 왜', '이게 뭐야',
      '해지', '해약', '탈퇴', '계약취소',
    ],
  },
  {
    level: 'error',          // 🟡 오류/장애
    emoji: '🟡',
    label: '오류/장애',
    color: '#ECC94B',
    keywords: [
      '오류', '에러', 'error', 'ERROR',
      '결제실패', '결제 실패', '결제오류', '결제 오류',
      '정산오류', '정산 오류', '정산 안', '정산이 안',
      '안돼', '안됨', '안 돼', '안 됨', '작동 안', '작동안',
      '먹통', '접속불가', '접속 안', '접속이 안',
      '화면이 안', '로그인 안', '로그인이 안',
    ],
  },
  {
    level: 'notice',         // 🔵 CX 참고
    emoji: '🔵',
    label: 'CX 참고',
    color: '#4299E1',
    keywords: [
      '긴급', '급함', '빨리', '빨리해주', '서둘러',
      '답장없', '답장 없', '연락없', '연락 없', '연락이 안',
      '무시', '씹', '읽씹', '안읽어',
      '담당자', '대표', '팀장', '책임자',
      '언제까지', '얼마나 더', '기다려야',
    ],
  },
];

/**
 * 메시지에서 키워드를 감지하고 매칭 결과를 반환
 * @param {string} text - 분석할 메시지 텍스트
 * @returns {{ matched: boolean, level: string|null, rule: object|null, matchedKeywords: string[] }}
 */
function detectKeywords(text) {
  if (!text) return { matched: false, level: null, rule: null, matchedKeywords: [] };

  const lowerText = text.toLowerCase();

  // 심각도 순으로 체크 (높은 우선순위부터)
  for (const rule of KEYWORD_RULES) {
    const matchedKeywords = rule.keywords.filter(kw =>
      lowerText.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      return {
        matched: true,
        level: rule.level,
        rule,
        matchedKeywords,
      };
    }
  }

  return { matched: false, level: null, rule: null, matchedKeywords: [] };
}

module.exports = { detectKeywords, KEYWORD_RULES };
