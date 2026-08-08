import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConnectGitCredentialDto {
  @IsIn(['gitlab', 'bitbucket'])
  provider: 'gitlab' | 'bitbucket';

  @IsString()
  @MaxLength(500)
  token: string;

  /** จำเป็นเฉพาะ bitbucket (app password ผูกกับ username) — gitlab ไม่ต้องส่ง */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  username?: string;
}
