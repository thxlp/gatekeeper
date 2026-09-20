import { IsIn, IsString, Length, Matches } from 'class-validator';

export class OtpVerifyDto {
  // รหัส 6 หลักจากอีเมล — เผื่อช่วงกว้างไว้เล็กน้อยกัน edge (เว้นวรรค/รูปแบบอนาคต)
  // แต่ต้องเป็นตัวเลขล้วนเสมอ: ฝั่ง UI กรองอักขระที่ไม่ใช่ 0-9 ทิ้งแล้ว แต่ UI บังคับอะไรไม่ได้จริง
  // ใครยิง API ตรงก็ข้ามไปได้ — ด่านที่นับว่า "บังคับ" คือ validator ตัวนี้เท่านั้น
  @IsString()
  @Length(4, 10)
  @Matches(/^[0-9]+$/, { message: 'code ต้องเป็นตัวเลขเท่านั้น' })
  code: string;
}

export class TwoFaOtpRequestDto {
  @IsIn(['enable', 'disable'])
  intent: 'enable' | 'disable';
}
