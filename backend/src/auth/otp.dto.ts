import { IsIn, IsString, Length } from 'class-validator';

export class OtpVerifyDto {
  // รหัส 6 หลักจากอีเมล — เผื่อช่วงกว้างไว้เล็กน้อยกัน edge (เว้นวรรค/รูปแบบอนาคต)
  @IsString()
  @Length(4, 10)
  code: string;
}

export class TwoFaOtpRequestDto {
  @IsIn(['enable', 'disable'])
  intent: 'enable' | 'disable';
}
