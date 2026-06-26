import { IsString, IsUrl, IsEnum, IsArray, IsOptional, ValidateNested } from 'class-validator';
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
