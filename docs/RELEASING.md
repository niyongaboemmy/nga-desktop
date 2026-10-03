# Releasing NGA Desktop

## Every release

1. `main` is green in CI.
2. Run `npm run release -- X.Y.Z`, then `git push origin main --follow-tags`.
3. The **Release** workflow builds:
   - Windows: `NGA_X.Y.Z_x64-setup.exe` (NSIS, per-user) and `NGA_X.Y.Z_x64_en-US.msi`.
   - macOS: `NGA_X.Y.Z_universal.dmg`.
   - When the updater key is configured: the `.sig` files and `latest.json`.

   All of it lands in a **draft** GitHub Release.
4. Smoke-test the draft installers on Windows 11 and an Apple Silicon Mac. Use the checklist in `docs/IMPLEMENTATION_PLAN.md` §8.2.
5. Publish the draft. Only now does the updater see it.
6. If the repository is private, copy the assets to `downloads.amashuri.com/desktop/` (§6.4 of the plan). Private release assets aren't publicly downloadable, so installed apps update from that mirror.

To get unsigned test installers without a release, use **Actions → Test installers → Run workflow**. They appear as workflow artifacts.

## Turning signing on

Each piece switches on as soon as its secrets exist. Before that, the same workflow builds unsigned installers.

### In-app updates (do this before the first build you give to users)

```bash
npx tauri signer generate -w ~/.tauri/nga-desktop.key     # choose a password
```

- **Secret** `TAURI_SIGNING_PRIVATE_KEY`: the contents of `~/.tauri/nga-desktop.key`.
- **Secret** `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password.
- **Variable** (not a secret) `NGA_UPDATER_PUBKEY`: the contents of `~/.tauri/nga-desktop.key.pub`. It is compiled into the app.
- Back up the key and password **offline** (password manager or vault). **If the key is lost, installed apps can never update again.**

Builds made without `NGA_UPDATER_PUBKEY` have the updater switched off. Settings → Updates says so.

### macOS: Developer ID signing and notarization

You need an Apple Developer Program membership as an organisation (needs a D-U-N-S number), then:

- `APPLE_CERTIFICATE`: base64 of the exported *Developer ID Application* `.p12`.
- `APPLE_CERTIFICATE_PASSWORD`: the password of that `.p12`.
- `APPLE_SIGNING_IDENTITY`: `Developer ID Application: <Org> (<TEAMID>)`.
- `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8`: an App Store Connect API key (issuer id, key id, and the `.p8` file contents) for notarization.

To check a build: `spctl -a -vvv -t install NGA_*.dmg` should print `source=Notarized Developer ID`.

### Windows: Authenticode

Azure Artifact Signing (formerly Trusted Signing) only accepts organisations in the US, Canada, the EU, the UK and a few other countries. **Rwanda is not eligible.** Use an **OV code-signing certificate held in a cloud HSM**, such as SSL.com eSigner, DigiCert KeyLocker or Certum SimplySign. Then:

1. Add the vendor's signing CLI to the Windows job.
2. Add `bundle.windows.signCommand` (e.g. `"<vendor-cli> sign ... %1"`) to `src-tauri/tauri.conf.json`.
3. Add the vendor credentials as secrets, exported in the "Signing environment" step.

SmartScreen reputation builds up over the first downloads. An EV certificate no longer skips that, so it isn't worth the extra cost.

## Versions

SemVer, applied to the **shell** only:

- **MAJOR**: a breaking change to what the web apps can rely on (the UA marker, a future bridge).
- **MINOR**: features.
- **PATCH**: fixes.

Web-app changes never need a desktop release.
