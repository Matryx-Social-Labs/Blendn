const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

/*
 * Agent worktrees live in `.claude/worktrees/*`, inside the project, each with
 * a full copy of the app and a `node_modules` symlink. Metro crawled and
 * watched all of them: its file map fell over on their churn, and a stale
 * crawl served a `lib/theme` without the newest exports ("Cannot read
 * property 'pressed' of undefined"). None of it is app code.
 */
const claudeDir = /[/\\]\.claude[/\\].*/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing
  ? [].concat(existing, claudeDir)
  : claudeDir;

module.exports = config;
