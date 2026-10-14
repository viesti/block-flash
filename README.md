# BLOCK FLASH

A Geometry Dash clone mostly created with Claude with my 10 year old

Hosted at https://tiuhti.net/tsirppu-dash/

## Development

Start local web server (serves at http://localhost:8000):

```bash
bb web
```

Or specify a custom port:

```bash
bb web 3000
```

### ClojureScript (Squint)

ClojureScript sources in `src/cljs/` compile directly into ES modules in `dist/` using [Squint](https://github.com/squint-cljs/squint), and tests are in `test/cljs/` using `clojure.test`:

Compile once:
```bash
bb compile
```

Or watch and auto-recompile on changes:
```bash
bb watch
```

Run test suite:
```bash
bb test
```

Generate CDN importmap using JSPM:
```bash
bb importmap
```

Release to S3 (runs tests and syncs via `upload.sh`):
```bash
bb release
```

- On feature branches (e.g. `squint`), releases to preview path `https://tiuhti.net/tsirppu-dash/branch/<name>/`.
- On `main`/`master`, releases to production root `https://tiuhti.net/tsirppu-dash/`.
- Use `bb release --prod` to force production release from any branch, or `bb release --dryrun` to preview file changes without uploading.
