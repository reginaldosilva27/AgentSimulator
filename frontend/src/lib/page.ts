// 041-settings-page · The top-level page union. There's no real router (the
// codebase intentionally uses a simple `useState<Page>` in `App.tsx`, mirroring
// the original Sim ↔ Learn toggle from 005). The `settings` value lands the
// user on the dedicated `<SettingsPage />`; only one of these is ever mounted.
// 100-arena-capacity-sandbox adds `arena` — the separate capacity-sandbox page,
// reached from a header button beside Learn. Still only one page mounted at once.
export type Page = "sim" | "learn" | "settings" | "arena";
