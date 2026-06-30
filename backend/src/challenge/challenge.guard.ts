import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ChallengeService } from './challenge.service';

@Injectable()
export class CookieChallengeGuard implements CanActivate {
  constructor(private readonly challengeService: ChallengeService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.socket?.remoteAddress || '';
    const token = req.cookies?.[this.challengeService.cookieName()];
    if (!this.challengeService.verifyToken(token, ip)) {
      throw new ForbiddenException('ต้องผ่าน challenge ก่อนเข้าถึง endpoint นี้');
    }
    return true;
  }
}
