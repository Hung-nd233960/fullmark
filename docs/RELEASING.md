# Releasing

Releases go to PyPI as `fullmark` through GitHub Actions with trusted publishing: no token is stored anywhere. Pushing a tag `v*` runs `.github/workflows/publish.yml`, which builds with uv and uploads.

## One-time setup (the owner does these)

1. Rename the GitHub repository to `fullmark` and make it public.
2. On PyPI, add a **pending trusted publisher** for the project `fullmark`: owner `Hung-nd233960`, repository `fullmark`, workflow `publish.yml`, environment `pypi`.
3. In the GitHub repository settings, create the environment `pypi`.

## Each release

1. Bump the version in `pyproject.toml` and `src/fullmark/__init__.py`, then run `uv lock`.
2. Run the full suite: `uv run pytest -q`.
3. Commit, then tag and push:

```sh
git tag -a vX.Y.Z -m vX.Y.Z   # annotated: --follow-tags skips lightweight tags
git push --follow-tags
```

To check a build first, run `uv build` and `uvx twine check dist/*`; both are safe and upload nothing.
