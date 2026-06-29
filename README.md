# Living Silk

A physically-based rendering prototype for Nalli Silk Sarees. It takes a flat saree
product photo and rebuilds it as lit, draping silk you can spin in the browser:

- silk **sheen** (anisotropic soft specular, aligned with the fall of the cloth)
- **zari** metalness derived from the bright/warm pixels of the photo itself
- **dual-tone** shot-silk: a view-angle hue shift driven by Fresnel
- **woven micro-relief**: a normal map embossed from the photo's own weave and motifs

Nothing is generated. The real product photo is the texture; the renderer adds the light.

## Use

Open `index.html` (static site, no build step). Click a sample, paste a `nalli.com`
product link or any image URL, and use the **Material** panel to tune sheen, zari glow,
dual-tone shimmer, drape, and lighting. "Compare to original photo" reveals the flat
source image it started from.

Built with three.js (`MeshPhysicalMaterial`). Hosted on GitHub Pages.

## Credits

Prototype by Doug Hatcher (hatcher.ltd). Saree imagery © Nalli Silk Sarees Pvt. Ltd.,
used for demonstration.
