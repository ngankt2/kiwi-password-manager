import type { CustomField } from './vault';

export const isKeePassOtpSecret = (label: string): boolean => /^TimeOtp-Secret(?:-(?:Base32|Base64|Hex))?$/i.test(label.trim());

export function isOtpField(field: Pick<CustomField, 'kind' | 'label' | 'value'>): boolean {
  return field.kind === 'otp' || /^(?:otp|totp)$/i.test(field.label.trim()) || isKeePassOtpSecret(field.label) || /^otpauth:\/\//i.test(field.value.trimStart());
}
