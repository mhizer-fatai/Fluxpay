# FluxPay brand assets

The mark is the in-app "F" badge: a `#D35A44` rounded square with a white geometric F and a
flow arrow (flux → flow). The wordmark is lowercase `fluxpay` in Segoe UI Bold, matching the
app header and landing page.

| File | Use |
|---|---|
| `fluxpay-mark.png` | Square mark, transparent background (1024×1024) — avatars, favicons, hackathon submission |
| `fluxpay-mark-light.png` | Same mark on a light background (for places that flatten transparency) |
| `fluxpay-logo.png` | Horizontal lockup, dark wordmark (light backgrounds) — README, decks |
| `fluxpay-logo-white.png` | Horizontal lockup, white wordmark (dark backgrounds) |
| `fluxpay-mark.svg` | Editable vector source of the mark |

## Regenerating the PNGs

The PNGs are rendered from `generate-brand.cs` with the .NET Framework compiler (no
dependencies):

```powershell
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /out:brand\generate-brand.exe brand\generate-brand.cs
.\brand\generate-brand.exe
```

Palette: brand `#D35A44` · ink `#17191A` · paper `#F6F7F8`.
