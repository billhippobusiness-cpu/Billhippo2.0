# Connector build resources

Place packaging assets here for `electron-builder`.

## App icon (`icon.ico`)

Add a Windows icon named **`icon.ico`** (256×256 recommended, multi-resolution),
then uncomment the `icon: build/icon.ico` line in `../electron-builder.yml`.

Without it, the installer/app uses the default Electron icon — fine for testing,
but ship a branded icon before the public release.

## Tray icon

The tray currently uses a tiny embedded placeholder (see `src/main.ts`). For a
crisp tray icon, add a 16×16 / 32×32 PNG and load it in `main.ts` instead.
