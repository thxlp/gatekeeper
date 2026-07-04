import { IsString, IsEnum, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PluginEndpointDto {
  @IsEnum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  @IsString()
  path: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class RegisterPluginDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  base_url: string;

  @IsEnum(['bearer', 'api_key', 'basic', 'none'])
  auth_type: 'bearer' | 'api_key' | 'basic' | 'none';

  @IsOptional()
  @IsString()
  auth_header?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PluginEndpointDto)
  endpoints: PluginEndpointDto[];

  // GitApp.id ของโปรเจกต์ที่จะผูก plugin นี้เข้าไว้ด้วย (ไม่บังคับ, ว่าง = ไม่ผูกโปรเจกต์ไหน)
  @IsOptional()
  @IsString()
  project_id?: string;
}

export class UpdatePluginDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  base_url?: string;

  @IsOptional()
  @IsEnum(['bearer', 'api_key', 'basic', 'none'])
  auth_type?: 'bearer' | 'api_key' | 'basic' | 'none';

  @IsOptional()
  @IsString()
  auth_header?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PluginEndpointDto)
  endpoints?: PluginEndpointDto[];

  // ส่ง '' มาเพื่อเอาออกจากโปรเจกต์เดิม (unset) — ไม่ส่ง field นี้มาเลย = ไม่แก้ค่าเดิม
  @IsOptional()
  @IsString()
  project_id?: string;
}

export class ProxyCallDto {
  @IsString()
  endpoint_path: string;

  @IsEnum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  @IsOptional()
  body?: any;

  @IsOptional()
  headers?: Record<string, string>;

  // ส่ง credential จาก client แบบ encrypted (ไม่ persist ใน store)
  @IsOptional()
  @IsString()
  credential?: string;
}
