# Elara Ulyatila — Workspace Rules

- Always start the live Vite dev server (`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180`) and open it in the browser pane during UI/UX work so the user sees changes live.
- Preserve Elara branding (**ELARA Ulyatila**), royal purple / pearl white / champagne gold palette, Portuguese (`pt-AO`) copy, and Kz currency. Keep internal localStorage keys (`trajectoria_theme`, `trajectoria_demo`) and Android package ID (`ao.elara.trajectoria`) unchanged.
- Before deploying, pass `tsc --noEmit`, all 7 `.pkg/*_test.cjs` suites, `.pkg/contrast.cjs` (0 AA failures), and `vite build`.
- Never commit `.env.local`, `dist/`, `node_modules/`, or signing keystores. Never apply Supabase migrations `0004`/`0005`/`0007`/`0008` without explicit instruction.
- Keep the Portuguese developer notes inside `src/components/NavIcons.tsx`, `src/components/ElaraCarMark.tsx`, and `src/components/VehicleArt.tsx`.
