# Changelog

## [1.1.0](https://github.com/astro-api/astro-ai-chat/compare/astro-ai-chat-v1.0.1...astro-ai-chat-v1.1.0) (2026-07-23)


### Features

* add ad-hoc code signing for macOS distribution ([e030dea](https://github.com/astro-api/astro-ai-chat/commit/e030deaf18350634886f6e62eff9da4dbb3913a5))
* add AI engine with streaming and tool orchestration ([9703748](https://github.com/astro-api/astro-ai-chat/commit/9703748ef9450f864337101237aa9df00997e2eb))
* add AI engine, IPC handlers, and contextBridge preload API ([f889c1f](https://github.com/astro-api/astro-ai-chat/commit/f889c1f9ce8d25d26cd2a963b1e26c2148f242fa))
* add AI tools definitions and astro client wrapper ([1d22809](https://github.com/astro-api/astro-ai-chat/commit/1d22809b0361842f4f7a666bf1736d0a9389edba))
* add AI tools definitions for memory and astrology API ([dc76d87](https://github.com/astro-api/astro-ai-chat/commit/dc76d873a55f4fae8855749e68b0e5048ace9e77))
* add astro API client wrapper with lazy init ([4384c2f](https://github.com/astro-api/astro-ai-chat/commit/4384c2fbbdf3e261d7cf400828141ac82806f6aa))
* add full chat UI with sidebar, message list, input bar, and settings ([ddbdc85](https://github.com/astro-api/astro-ai-chat/commit/ddbdc85562dd0d9a511bb56d29ad8e82d0f4dc01))
* add hasApiKeys flag and setup card for new users ([e902ab1](https://github.com/astro-api/astro-ai-chat/commit/e902ab1a9448fc52ce73b8fc17ecf6df8928e0e6))
* add help links to API key fields in Settings ([a8f21a9](https://github.com/astro-api/astro-ai-chat/commit/a8f21a92104d2cc2b6b59315c1aef5b37e9e8d56))
* add IPC handlers and contextBridge preload API ([ad6d87e](https://github.com/astro-api/astro-ai-chat/commit/ad6d87ee6699f3f51793a6a2cae5744f731dae34))
* add onboarding translation keys for 8 languages ([44541b6](https://github.com/astro-api/astro-ai-chat/commit/44541b61e3d69b8c6a279e7b0dd8f16bbdb2c3da))
* add PKG installer for macOS as primary distribution format ([cf5ea54](https://github.com/astro-api/astro-ai-chat/commit/cf5ea5470592cc8682851b6d4b1c3eac1a899091))
* add SQLite schema and Drizzle ORM with auto-migrations ([f375ef0](https://github.com/astro-api/astro-ai-chat/commit/f375ef05bb7f03c4e1f44b8b46709175440de14c))
* add useChat hook for IPC-based chat state management ([a56d353](https://github.com/astro-api/astro-ai-chat/commit/a56d3536a6a4478c0acb7bd5b836fe24692bd234))
* expose shell.openExternal via IPC ([997aa67](https://github.com/astro-api/astro-ai-chat/commit/997aa6714381b99f2f9b45758549258b09c0feba))
* implement automatic chat summarization to manage token usage and context window limits ([1f998e1](https://github.com/astro-api/astro-ai-chat/commit/1f998e13c42589752acb52f12150bed8326060cd))
* implement internationalization, redesign UI components, and add model management and window title control APIs. ([3aedde3](https://github.com/astro-api/astro-ai-chat/commit/3aedde3d2f961fd147e2221febb659d5f88339c7))
* init electron-vite react-ts project with dependencies ([139de09](https://github.com/astro-api/astro-ai-chat/commit/139de098dc9ac6353e087125ebcaa51dd230b53d))


### Bug Fixes

* add disable-library-validation entitlement for macOS Sequoia ad-hoc signing ([f1e6dd0](https://github.com/astro-api/astro-ai-chat/commit/f1e6dd0366ff8fe587fbd9fb1095cb0c1fba4826))
* build mac x64 and arm64 separately to avoid native module conflict ([347501e](https://github.com/astro-api/astro-ai-chat/commit/347501e11ef6f61055d3c8d6316b53fb29ba6dfd))
* clean up CSS conflicts, remove unused packages, fix metadata ([d0fccb0](https://github.com/astro-api/astro-ai-chat/commit/d0fccb0e1d87eb2a4a48d9944efba57a43c526e1))
* proper inside-out ad-hoc signing for macOS Sequoia compatibility ([553eed4](https://github.com/astro-api/astro-ai-chat/commit/553eed475c35681e6f3d7f22e0680d6840ed7f5a))
* remove snap target, release runs if mac+win succeed ([2526a6f](https://github.com/astro-api/astro-ai-chat/commit/2526a6f30ac005f9a7f74ab4a3c72e80024dfa62))
* replace afterSign .sh with .cjs for electron-builder compatibility ([93ed066](https://github.com/astro-api/astro-ai-chat/commit/93ed0665156a99b2e55eaaa0a06c8b8101ff0d6c))
* replace serslon with procoders in appId and author ([5cc9f30](https://github.com/astro-api/astro-ai-chat/commit/5cc9f307b277834ef48f5be6ba40f48ef72f5762))
* require all platforms to succeed before release, add linux build deps ([4d913fb](https://github.com/astro-api/astro-ai-chat/commit/4d913fbc51d2f88ec521e848b04606a701009550))
* resolve migration path for production, add error handling for DB init ([83fbefd](https://github.com/astro-api/astro-ai-chat/commit/83fbefd510a8472f84ec69d0c8c9d574df563812))
* run vite build once then package separately for x64 and arm64 ([7729f24](https://github.com/astro-api/astro-ai-chat/commit/7729f24f1556f7d823f5335af51ed0e0325b5329))
* update copyright to 2026 Procoders ([85073f3](https://github.com/astro-api/astro-ai-chat/commit/85073f3dd8d6587eb94de8be96b89fea1f5c5802))
* update repo URL to astro-api/astro-ai-chat ([9ede111](https://github.com/astro-api/astro-ai-chat/commit/9ede111560e5a44d9476295802dea732140ece9a))


### Documentation

* add design spec for automated changelog via release-please ([495e875](https://github.com/astro-api/astro-ai-chat/commit/495e875de746d6a4ee79cd35634b56c6dd7b0af9))
* add design spec for stop generation & edit message ([b19514a](https://github.com/astro-api/astro-ai-chat/commit/b19514aeea68460ad88a2fc99c4cefab6249cb0e))
* add full README with build instructions, API keys, and project structure ([280deb7](https://github.com/astro-api/astro-ai-chat/commit/280deb77f3118ec29ebfa094bcd58f813f6b021f))
* add implementation plan for automated changelog via release-please ([fe46201](https://github.com/astro-api/astro-ai-chat/commit/fe46201dca8272ca1310f5772d3d48194cffe839))
* add implementation plan for stop generation & edit message ([60f34a9](https://github.com/astro-api/astro-ai-chat/commit/60f34a97c432a96fa73220f91c7d5ba10ec09d82))
* add macOS Gatekeeper known issue section, fix outdated refs ([fb394e9](https://github.com/astro-api/astro-ai-chat/commit/fb394e9502cb87f9b8467fbe41cd57e3ad6c23f5))
* add releasing a new version section to README ([47b9744](https://github.com/astro-api/astro-ai-chat/commit/47b9744905ff52dff1c829976a7a72e0bc1dff0e))
* document release-please release flow in CLAUDE.md ([b84597a](https://github.com/astro-api/astro-ai-chat/commit/b84597a944577de2ab624c52c3713b64bd40de77))
* translate changelog design spec to English ([0c5af6e](https://github.com/astro-api/astro-ai-chat/commit/0c5af6e4df8ded4b8980cc1da5693060c4895194))
* update macOS install instructions with codesign command ([37c8fab](https://github.com/astro-api/astro-ai-chat/commit/37c8fabbf3ab827b763b4200f87ef8247e985615))
