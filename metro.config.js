const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'crypto' && platform !== 'web') {
    return context.resolveRequest(context, 'react-native-quick-crypto', platform);
  }
  if (moduleName === 'crypto' && platform === 'web') {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
