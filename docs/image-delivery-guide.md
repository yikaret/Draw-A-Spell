# Image Delivery Guide (Drawaspell)

## What is now implemented in app code
- `src/App.tsx` now uses a webp-first image fallback chain.
- Production defaults now use Cloudflare image resizing with `format=webp`.
- Image optimization is no longer limited to `/assets/Images/*`; all raster assets under `/assets/*` are eligible.
- Card/hand/hover/deck/showcase image renderers now use fallback-aware loading, so missing webp files fall back to png/jpg automatically.
- Optional CDN origin support is wired through `VITE_ASSET_CDN_BASE_URL` (no gameplay logic changes required).
- Cloudflare deploy scripts now target a dedicated asset-origin Pages project: `https://drawaspell-assets.pages.dev`.

## Production env settings
File: `.env.production`

```env
VITE_CF_IMAGE_LOADER=auto
VITE_CF_IMAGE_FORMAT=webp
VITE_CF_IMAGE_QUALITY=65
VITE_CF_IMAGE_WIDTH=720
VITE_ASSET_CDN_BASE_URL=https://drawaspell-assets.pages.dev
```

## Current deploy flow
- `npm run cf:assets:deploy` publishes `public/assets/**` to the `drawaspell-assets` Pages project.
- `npm run cf:pages:deploy` builds the app with `VITE_ASSET_CDN_BASE_URL=https://drawaspell-assets.pages.dev`, prunes mirrored `public/assets/**` files from `dist`, and deploys only the app shell/runtime bundle to `drawaspell`.
- `npm run cf:deploy:all` runs the asset publish followed by the app publish for first-time setup or bulk asset updates.

## Recommended Cloudflare setup
1. Keep `drawaspell.com` proxied (orange cloud) in Cloudflare DNS.
2. Keep static cache headers for `/assets/*` (already configured in `public/_headers`).
3. Serve app through Cloudflare Pages as you do now.
4. Confirm resized image responses return modern format:
   - Open a card image request from `/cdn-cgi/image/...`.
   - Verify response `content-type` is `image/webp` (or avif if you later switch to `format=auto`).

## Future CDN migration (no major app refactor)
1. Create `cdn.drawaspell.com` (Cloudflare R2 + custom domain, or equivalent CDN origin).
2. Mirror your current asset paths so URLs remain consistent (`/assets/...`).
3. Set `VITE_ASSET_CDN_BASE_URL=https://cdn.drawaspell.com`.
4. Rebuild and deploy Pages.
5. Validate network requests are served from the CDN host.

## Current custom-domain blocker
- `cdn.drawaspell.com` has already been added to the `drawaspell-assets` Pages project.
- Validation is currently blocked only by DNS because the active Wrangler OAuth token can manage Pages but cannot create DNS records in the zone.
- Finish the cutover by creating this DNS record in Cloudflare for `drawaspell.com`:
  `Type: CNAME`, `Name: cdn`, `Target: drawaspell-assets.pages.dev`, `Proxy status: Proxied`
- After that record is active, change `.env.production` to `VITE_ASSET_CDN_BASE_URL=https://cdn.drawaspell.com` and run `npm run cf:pages:deploy`.

## Optional: store real `.webp` files at origin
You do not need this immediately because Cloudflare is already serving webp output from png/jpg sources. If you still want origin files in webp:
1. Batch-convert source images to `.webp`.
2. Keep original png/jpg during transition.
3. Upload both formats.
4. Remove legacy formats later after traffic/error review.
