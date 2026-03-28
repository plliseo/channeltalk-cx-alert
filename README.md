# 📣 채널톡 CX 모니터링 & 슬랙 알림 시스템

> 페이쌤 CX파트너팀 — 채널톡 상담 중 문제 상담·주요 이슈를 실시간으로 슬랙에 알려주는 시스템

---

## 🔍 어떻게 동작하나요?

```
고객이 채널톡에 메시지 전송
        ↓
채널톡이 Webhook으로 서버에 실시간 전송
        ↓
키워드 필터 (4단계 심각도 분류)
        ↓
감지 시 슬랙 채널에 자동 알림 발송
```

### 📌 알림 심각도 분류

| 등급 | 색상 | 키워드 예시 |
|------|------|-----------|
| 🔴 심각 | 빨강 | 환불, 법적조치, 신고, 소비자원, 공정위, 고소 |
| 🟠 고객 불만 | 주황 | 짜증, 화나, 최악, 불만, 실망, 해지, 탈퇴 |
| 🟡 오류/장애 | 노랑 | 오류, 에러, 결제실패, 정산오류, 먹통, 안됨 |
| 🔵 CX 참고 | 파랑 | 긴급, 빨리, 답장없, 연락없, 담당자, 책임자 |

---

## 🚀 설치 및 실행

### 1단계 · 프로젝트 설치
```bash
git clone https://github.com/your-repo/channeltalk-cx-alert.git
cd channeltalk-cx-alert
npm install
```

### 2단계 · 환경변수 설정
```bash
cp .env.example .env
```
`.env` 파일을 열고 아래 값을 입력하세요.

---

## ⚙️ 슬랙 앱(Bot) 만들기

> Slack Bot Token을 발급받아야 합니다.

1. **https://api.slack.com/apps** 접속 → `Create New App`
2. `From scratch` 선택 → 앱 이름 입력 (예: `CX-Alert-Bot`) → 워크스페이스 선택
3. 좌측 메뉴 **OAuth & Permissions** 클릭
4. **Bot Token Scopes** 에서 아래 권한 추가:
   - `chat:write`
   - `chat:write.public`
5. 상단 **Install to Workspace** 클릭 → 승인
6. **Bot User OAuth Token** (`xoxb-...`) 복사 → `.env`의 `SLACK_BOT_TOKEN`에 입력

### 슬랙 채널 ID 확인 방법
1. 알림받을 채널 우클릭 → `채널 세부정보 보기`
2. 맨 아래 **채널 ID** 복사 → `.env`의 `SLACK_CHANNEL_ID`에 입력
3. 해당 채널에 Bot 초대: `/invite @CX-Alert-Bot`

---

## 📡 채널톡 Webhook 등록

1. **채널톡 관리자 콘솔** → 설정 → 개발 → Webhook
2. `+ 웹훅 추가` 클릭
3. URL 입력: `https://서버주소:3000/webhook`
4. 이벤트 선택:
   - ✅ `message` (새 메시지)
   - ✅ `userChatOpened` (새 상담 시작)
5. 저장 후 발급된 **Webhook Token** → `.env`의 `CHANNELTALK_WEBHOOK_TOKEN`에 입력

> 💡 로컬 개발 시에는 [ngrok](https://ngrok.com/)을 사용해 외부 URL을 만들 수 있습니다.
> ```bash
> ngrok http 3000
> # → https://xxxx.ngrok.io/webhook 을 채널톡에 등록
> ```

---

## ▶️ 실행

```bash
# 일반 실행
npm start

# 개발 모드 (파일 변경 시 자동 재시작)
npm run dev
```

### 테스트 알림 보내기
```bash
# 기본 테스트 메시지
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json"

# 커스텀 메시지 테스트
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"message": "결제 오류가 계속 발생합니다. 환불 요청드립니다."}'
```

---

## 📁 프로젝트 구조

```
channeltalk-cx-alert/
├── src/
│   ├── server.js      # Express 서버 + Webhook 수신
│   ├── keywords.js    # 키워드 정의 및 필터 로직
│   └── slack.js       # Slack 알림 전송
├── .env.example       # 환경변수 템플릿
├── .env               # 실제 키 (gitignore 처리됨)
├── package.json
├── .gitignore
└── README.md
```

---

## 🔑 환경변수 목록

| 변수명 | 필수 | 설명 |
|--------|------|------|
| `SLACK_BOT_TOKEN` | ✅ | Slack Bot Token (`xoxb-...`) |
| `SLACK_CHANNEL_ID` | ✅ | 알림 채널 ID (`C0XXXXXXX`) |
| `CHANNELTALK_ACCESS_KEY` | ✅ | 채널톡 API Access Key |
| `CHANNELTALK_ACCESS_SECRET` | ✅ | 채널톡 API Access Secret |
| `CHANNELTALK_WEBHOOK_TOKEN` | ⬜ | Webhook 서명 검증 토큰 |
| `PORT` | ⬜ | 서버 포트 (기본: 3000) |
| `NODE_ENV` | ⬜ | 환경 (development/production) |

---

## 🛠 키워드 커스터마이징

`src/keywords.js` 파일에서 키워드를 자유롭게 추가/수정할 수 있습니다.

```js
// 예시: 심각 등급에 키워드 추가
{
  level: 'critical',
  keywords: [
    '환불', '법적조치', '신고',
    '새로운키워드',  // ← 여기에 추가
  ],
}
```

---

## 📞 문의

페이쌤 CX파트너팀 | [payssam.kr](https://payssam.kr)
