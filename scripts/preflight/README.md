# Preflight site code checks

Custom checks for Experience Workspace preflight (https://github.com/adobe/da-live/pull/1369).

On `*.preview.da.live` only, `scripts.js`:
- snapshots each section and block in `decorateMain` before block JS runs
- defines `window.aem.preflight()`, which waits for the lazy phase, then loads `preflight.js`

One result per check (`YES`/`NO`/`NA`). Only the page's own content is checked; fragment content is checked on the fragment.

| id | checks |
| --- | --- |
| `unknown-block` | block not in `blocks.js`, or marked `authored: false` |
| `unknown-variant` | class not in the block's `variants`; `logged-in`/`logged-out` need `gated=true` |
| `block-content` | the block's `validate` |
| `tab-grouping` | tab sections not next to each other |
| `section-metadata` | unknown section style or metadata key |
| `template` | unknown template, or the template's `validate` |

## Adding a block

Add it to `blocks.js`. For content rules, add `blocks/{name}/{name}.preflight.js`:

```js
export default function validate(source, block) {
  return [{ message: 'What is wrong.', hint: 'How to fix it.' }];
}
```

`source` is the authored block before decoration; `block` is the decorated one.

## Adding a template

Add `templates/{name}/{name}.preflight.js` (`validate(doc, sourceOf)`) and register it in `templates.js`.
