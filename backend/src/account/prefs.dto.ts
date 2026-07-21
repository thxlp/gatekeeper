import { IsBoolean } from 'class-validator';

export class UpdatePrefsDto {
  @IsBoolean()
  notifyEmail: boolean;
}
