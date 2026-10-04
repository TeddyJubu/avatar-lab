# Publishing the runtime packages

The runtime is published as three public npm packages:

- `@bible-strong/avatar-core` contains the validation, playback and renderer-neutral scene APIs;
- `@bible-strong/avatar-react` depends on core and provides the React 19 integration;
- `@bible-strong/avatar-web` depends on core and provides the direct DOM/ESM integration.

All three packages keep the same version during the `0.x` stabilization period.

`@teddyjubu/avatar-mcp` is versioned independently and published under the TeddyJubu npm account.
It provides the MCP server for AI agents and is the source of the bundled server in the
`avatar-lab` Claude Code plugin.

Semantic Versioning is applied as follows:

- a compatible fix increments the patch version (`0.1.0` to `0.1.1`);
- a compatible feature increments the minor version (`0.1.0` to `0.2.0`);
- a breaking change also increments the minor version while below `1.0.0`;
- after `1.0.0`, a breaking change increments the major version.

## Normal release flow

1. Add a changeset to every pull request that changes a published API with `pnpm changeset`.
2. Merge changes into `main`.
3. The release workflow updates or creates a release pull request containing version and changelog
   changes.
4. Review and merge that release pull request.
5. The workflow validates, builds and publishes every unpublished version to npm.

Publication uses npm trusted publishing through GitHub Actions OIDC. It does not require a stored
`NPM_TOKEN`. Each npm package must trust the `release.yml` workflow in the
`smontlouis/bible-strong-avatar-lab` repository.

## Local verification

Run the complete project checks and verify real consumer projects against packed tarballs:

```sh
pnpm check
pnpm packages:smoke
```

Do not run `npm publish` from an individual package for routine releases. The initial `0.1.0`
bootstrap publication is the only manual release.

## Publishing `@teddyjubu/avatar-mcp`

npm trusted publishing can only be configured for a package that already exists, so
`@teddyjubu/avatar-mcp` is published with an npm token stored as a GitHub secret. Nobody needs the
token locally, and it never has to be shared with an agent:

1. On npmjs.com, signed in as the TeddyJubu account, open **Access Tokens → Generate New Token →
   Granular Access Token**. Give it read and write access to packages (all packages until the first
   release exists, then only `@teddyjubu/avatar-mcp`) and allow it to bypass two-factor
   authentication for automation.
2. On GitHub, open the `TeddyJubu/avatar-lab` repository → **Settings → Secrets and variables →
   Actions → New repository secret**, name it `NPM_TOKEN` and paste the token.
3. Merge into `main`. The release workflow publishes every unpublished version, starting with
   `@teddyjubu/avatar-mcp@0.1.0`. Later releases follow the normal changeset flow above.

Optionally, after the first release, add the `release.yml` workflow of `TeddyJubu/avatar-lab` as a
trusted publisher for the package on npmjs.com and delete the token.

## Claude Code plugin

The `avatar-lab` plugin under `plugins/avatar-lab` is distributed through the repository
marketplace (`.claude-plugin/marketplace.json`), not npm. `pnpm version-packages` runs
`pnpm plugin`, which copies the `@teddyjubu/avatar-mcp` version into the plugin and marketplace
manifests and regenerates the bundled server. `pnpm check` fails when they are stale.
