/**
 * 🍀 클로버 리포트 스케줄러
 * Railway에서 24/7 실행되는 메인 프로세스
 * node-cron으로 모든 스케줄 관리 (Asia/Seoul 기준)
 */

const cron = require('node-cron');

console.log('🍀 클로버 리포트 스케줄러 시작');
console.log(`📅 현재 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);

// ── 스파이크 알림: 매 5분 (24/7) ──────────────────────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const { run } = require('./scripts/spike_alert');
    await run();
  } catch (e) {
    console.error('❌ 스파이크 알림 오류:', e.message);
  }
}, { timezone: 'Asia/Seoul' });

// ── 야간 리포트: 평일 09:27 ────────────────────────────────────
cron.schedule('27 9 * * 1-5', async () => {
  try {
    const { run } = require('./scripts/night_report');
    await run();
  } catch (e) {
    console.error('❌ 야간 리포트 오류:', e.message);
  }
}, { timezone: 'Asia/Seoul' });

// ── 일일 리포트: 월~목 18:30 ───────────────────────────────────
cron.schedule('30 18 * * 1-4', async () => {
  try {
    const { run } = require('./scripts/daily_report');
    await run();
  } catch (e) {
    console.error('❌ 일일 리포트(월~목) 오류:', e.message);
  }
}, { timezone: 'Asia/Seoul' });

// ── 일일 리포트: 금요일 13:30 ──────────────────────────────────
cron.schedule('30 13 * * 5', async () => {
  try {
    const { run } = require('./scripts/daily_report');
    await run({ friday: true });
  } catch (e) {
    console.error('❌ 일일 리포트(금) 오류:', e.message);
  }
}, { timezone: 'Asia/Seoul' });

// ── 주간 리포트: 월요일 09:10 ──────────────────────────────────
cron.schedule('10 9 * * 1', async () => {
  try {
    const { run } = require('./scripts/weekly_report');
    await run();
  } catch (e) {
    console.error('❌ 주간 리포트 오류:', e.message);
  }
}, { timezone: 'Asia/Seoul' });

// ── 월간 리포트: 매월 1일 09:00 ───────────────────────────────
cron.schedule('0 9 1 * *', async () => {
  try {
    const { run } = require('./scripts/monthly_report');
    await run();
  } catch (e) {
    console.error('❌ 월간 리포트 오류:', e.message);
  }
}, { timezone: 'Asia/Seoul' });

// 프로세스 유지
process.on('uncaughtException', e => console.error('❌ 예외:', e.message));
process.on('unhandledRejection', e => console.error('❌ 거부:', e));
