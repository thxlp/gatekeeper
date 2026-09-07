// หน้าเดียวที่เหลือคือหน้าทักทายสาธารณะ — endpoint /webhooks/* ไม่มี auth จึงห้ามมีหน้า
// ที่ render ข้อมูลของ app ในไฟล์นี้เด็ดขาด (dashboard เดิมเคย leak repo/branch/timeline
// ให้ทุกคนที่รู้ app id — ถอดออก 2026-09-06) ของจริงอยู่ที่ /apps/<id> ซึ่งมี AuthGuard
const PAGE_STYLES = `
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    padding: 24px;
    box-sizing: border-box;
  }
  .card {
    width: 100%;
    max-width: 480px;
    text-align: center;
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 16px;
    padding: 40px 48px;
    box-shadow: 0 0 40px rgba(88,166,255,0.12);
  }
  .icon { font-size: 40px; margin-bottom: 12px; }
  h1 {
    font-size: 16px;
    font-weight: 600;
    color: #3fb950;
    margin: 0 0 8px;
  }
  p { font-size: 12px; color: #8b949e; margin: 4px 0; }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3fb950;
    margin-right: 6px;
    box-shadow: 0 0 8px #3fb950;
  }
`;

export function renderGreetingPage(): string {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>Gatekeeper Webhook Service</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐🚀</div>
    <h1>Gatekeeper Webhook Service is running smoothly! 🚀</h1>
    <p><span class="dot"></span>listening for POST /api/webhooks/github</p>
    <p>สำหรับ GitHub ยิง event เข้ามาเท่านั้น — endpoint นี้ไม่มีหน้าให้ใช้งานเอง</p>
  </div>
</body>
</html>`;
}
