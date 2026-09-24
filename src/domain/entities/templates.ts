import type { FieldKind, ItemType, CustomField } from './vault';

export const TYPE_LABELS: Record<ItemType, string> = {
  login: 'Login', 'secure-note': 'Secure note', 'api-key': 'API key', 'ssh-key': 'SSH key',
  env: 'Env',
  database: 'Database', server: 'Server', wifi: 'Wi-Fi', card: 'Card', custom: 'Custom secret',
};

type FieldTemplate = [string, string, FieldKind];
const templates: Record<ItemType, FieldTemplate[]> = {
  login: [['username', 'Username', 'text'], ['password', 'Password', 'secret'], ['website', 'Website', 'url'], ['otp', 'One-time password', 'otp']],
  'secure-note': [],
  env: [['env', 'Env', 'secret']],
  'api-key': [['key', 'API key', 'secret'], ['secret', 'Secret', 'secret'], ['endpoint', 'Endpoint', 'url']],
  'ssh-key': [['username', 'Username', 'text'], ['host', 'Host', 'text'], ['port', 'Port', 'number'], ['private-key', 'Private key', 'secret'], ['public-key', 'Public key', 'text'], ['passphrase', 'Passphrase', 'secret']],
  database: [['host', 'Host', 'text'], ['port', 'Port', 'number'], ['database', 'Database', 'text'], ['username', 'Username', 'text'], ['password', 'Password', 'secret'], ['connection', 'Connection string', 'secret']],
  server: [['host', 'Host / IP address', 'text'], ['username', 'Username', 'text'], ['password', 'Password', 'secret'], ['port', 'Port', 'number'], ['protocol', 'Protocol', 'text']],
  wifi: [['ssid', 'Network name (SSID)', 'text'], ['password', 'Password', 'secret'], ['security', 'Security', 'text']],
  card: [['holder', 'Cardholder', 'text'], ['number', 'Card number', 'secret'], ['expiry', 'Expiry', 'text'], ['cvv', 'Security code', 'secret']],
  custom: [['secret', 'Secret', 'secret']],
};

export function fieldsForType(type: ItemType): CustomField[] {
  return templates[type].map(([id, label, kind]) => ({ id, label, kind, value: '', protected: kind === 'secret' || kind === 'otp' }));
}
