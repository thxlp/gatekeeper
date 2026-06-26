import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const SECRET = process.env.GATEKEEPER_TICKET_SECRET || 'dev-secret-change-me';

interface TicketPayload {
  request_id: string;
  account_id: string;
  plugin_id?: string;
  expires_at: number;
}

@Injectable()
export class TicketService {
  sign(payload: Omit<TicketPayload, 'expires_at'>, ttlSeconds = 60): string {
    const data: TicketPayload = { ...payload, expires_at: Date.now() + ttlSeconds * 1000 };
    const json = JSON.stringify(data);
    const b64 = Buffer.from(json).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('hex');
    return `${b64}.${sig}`;
  }

  verify(token: string): TicketPayload {
    const [b64, sig] = token.split('.');
    if (!b64 || !sig) throw new Error('ticket_malformed');

    const expected = crypto.createHmac('sha256', SECRET).update(b64).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new Error('ticket_rejected:bad_signature');
    }

    const data: TicketPayload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (Date.now() > data.expires_at) throw new Error('ticket_rejected:expired');
    return data;
  }
}
