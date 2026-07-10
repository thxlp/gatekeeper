import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// คู่ key/value สำหรับ env var / build arg — value อาจเป็นความลับ (DATABASE_URL, API key)
// ถูกเข้ารหัสตอนเก็บใน store (ดู git-app.store.ts) และไม่ echo กลับทาง API เป็นค่าเต็ม
export class EnvVarDto {
  @IsString()
  @MaxLength(256)
  key: string;

  @IsString()
  @MaxLength(8192)
  value: string;
}

/**
 * ฟิลด์ config ต่อ app ที่ใช้ร่วมกันหลาย endpoint (register / register-github / update)
 * รวมไว้เป็น base class เดียวเพื่อไม่ให้ประกาศซ้ำ — validation เดียวกันทุกที่
 */
export class AppConfigDto {
  // env var ที่ inject เข้า container ตอนรัน
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EnvVarDto)
  envVars?: EnvVarDto[];

  // build arg ส่งเข้า docker build
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EnvVarDto)
  buildArgs?: EnvVarDto[];

  // backing service ที่ให้ระบบ provision (postgres/redis)
  @IsOptional()
  @IsIn(['postgres', 'redis'], { each: true })
  addons?: ('postgres' | 'redis')[];

  // resource ต่อ container (มี cap ฝั่ง server — ดู clampResources)
  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(4096)
  memoryMb?: number;

  @IsOptional()
  @IsInt({ message: 'cpu ต้องเป็นจำนวนเต็ม milli-cpu เช่น 500 = 0.5 vCPU' })
  @Min(100)
  @Max(4000)
  cpuMilli?: number;

  // static SPA history-fallback
  @IsOptional()
  spa?: boolean;
}
