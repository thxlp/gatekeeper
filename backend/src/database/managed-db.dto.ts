import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateManagedDbDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @IsIn(['postgres', 'redis', 'mysql'])
  engine: 'postgres' | 'redis' | 'mysql';
}

// attach/detach managed DB กับแอปหนึ่งตัว
export class AttachDbDto {
  @IsString()
  appId: string;
}

// รัน SQL หนึ่งคำสั่งใน console (postgres/mysql)
export class RunQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  sql: string;

  // false/ไม่ส่ง = คิวรีที่เขียนข้อมูลจะถูก rollback แล้วคืนจำนวนแถวที่จะกระทบมาให้ยืนยันก่อน
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

// รันคำสั่ง redis หนึ่งคำสั่ง
export class RedisCommandDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  command: string;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
