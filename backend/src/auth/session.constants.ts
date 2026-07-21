// แยกออกมาจาก auth.controller.ts ตอนเพิ่ม 2FA — controller ต้อง import AuthGuard ขณะที่
// guard ก็ต้องใช้ชื่อ cookie นี้ ถ้า constant ยังอยู่ใน controller จะเกิด circular import
// (guard → controller → guard) แล้ว @UseGuards(AuthGuard) เจอค่า undefined ตอน decorator รัน
export const SESSION_COOKIE_NAME = 'gk_session';
