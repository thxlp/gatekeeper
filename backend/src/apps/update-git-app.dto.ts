import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateGitAppDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['node', 'python', 'static', 'docker'])
  runtime?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
