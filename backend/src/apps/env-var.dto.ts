import { IsOptional, IsString, MaxLength } from 'class-validator';

// เพิ่ม/แก้ env var ทีละตัว (upsert) — validation ชื่อ key แบบ POSIX ทำต่อในเซอร์วิส
// (assertValidEnvKey) เพราะข้อความ error เป็นภาษาไทยและใช้ร่วมกับ import ด้วย
export class SetEnvVarDto {
  @IsString()
  @MaxLength(256)
  key: string;

  @IsString()
  @MaxLength(8192)
  value: string;
}

// import จากข้อความ .env ที่วางมาทั้งก้อน
export class ImportEnvDto {
  @IsString()
  @MaxLength(64 * 1024) // เผื่อไฟล์ .env ยาว แต่กันวางข้อความมหึมา
  raw: string;
}

// query ของ endpoint logs — tail เป็น string จาก query, แปลง/clamp ในเซอร์วิส
export class LogQueryDto {
  @IsOptional()
  @IsString()
  tail?: string;
}
