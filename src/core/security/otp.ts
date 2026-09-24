import { Secret, TOTP, URI } from 'otpauth';
import { fromBase64 } from '../bytes';
import { VaultError } from '../errors';

export interface OtpConfiguration {
  secret: string;
  encoding?: 'base32' | 'hex' | 'base64' | 'utf8';
  algorithm?: string;
  digits?: number;
  period?: number;
}

const MAX_CONFIGURATION_LENGTH = 16_384;

function decodeSecret(value: string, encoding: OtpConfiguration['encoding'] = 'base32'): Secret {
  if (!value || value.length > MAX_CONFIGURATION_LENGTH) throw new VaultError('VALIDATION');
  switch (encoding) {
    case 'utf8': return Secret.fromUTF8(value);
    case 'hex': {
      const hex = value.replace(/\s/g, '');
      if (!/^[\da-f]+$/i.test(hex) || hex.length % 2) throw new VaultError('VALIDATION');
      return Secret.fromHex(hex);
    }
    case 'base64': return new Secret({ buffer: fromBase64(value.replace(/\s/g, '')).buffer });
    case 'base32': {
      const base32 = value.replace(/[\s-]/g, '').toUpperCase();
      if (!/^[A-Z2-7]+=*$/.test(base32)) throw new VaultError('VALIDATION');
      return Secret.fromBase32(base32);
    }
    default: throw new VaultError('VALIDATION');
  }
}

export function generateOtp(configuration: string | OtpConfiguration, timestamp = Date.now()): { code: string; remaining: number; period: number } {
  let otp: TOTP | undefined;
  try {
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new VaultError('VALIDATION');
    if (typeof configuration === 'string' && /^otpauth:/i.test(configuration.trim())) {
      const uri = configuration.trim();
      if (uri.length > MAX_CONFIGURATION_LENGTH || !/^otpauth:\/\/totp\//i.test(uri)) throw new VaultError('VALIDATION');
      // Nonstandard encoders (for example Steam) must not silently produce a numeric TOTP.
      const parameters = new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
      for (const [key, value] of parameters) {
        if (key.toLowerCase() === 'encoder' && value.toLowerCase() !== 'default') throw new VaultError('VALIDATION');
      }
      const parsed = URI.parse(uri);
      if (!(parsed instanceof TOTP)) throw new VaultError('VALIDATION');
      otp = parsed;
    } else {
      const options = typeof configuration === 'string' ? { secret: configuration } : configuration;
      otp = new TOTP({ ...options, secret: decodeSecret(options.secret, options.encoding) });
    }
    if (!otp.secret.bytes.length || !Number.isInteger(otp.period) || otp.period < 1 || otp.period > 300 ||
        !Number.isInteger(otp.digits) || otp.digits < 6 || otp.digits > 8) throw new VaultError('VALIDATION');
    return { code: otp.generate({ timestamp }), remaining: otp.period - Math.floor(timestamp / 1000) % otp.period, period: otp.period };
  } catch { throw new VaultError('VALIDATION'); }
  finally { otp?.secret.bytes.fill(0); }
}
