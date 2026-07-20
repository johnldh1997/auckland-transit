const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle the pre-built GTFS static database (assets/gtfs.db) as a plain binary asset
// rather than letting Metro try to parse it as source.
config.resolver.assetExts.push('db');

module.exports = config;
