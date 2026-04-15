import sharp from 'sharp'

// Icon: dark rounded square bg + purple circle + light blue/purple small rounded square
// Mirrors the AstroAPI logo elements: circle cx=35 cy=50 r=30 fill=#8b5cf5
//                                      rect x=70 y=20 w=25 h=25 rx=8 fill=#a5b5fd
// Scaled to 512×512 with macOS app icon proportions

const size = 512

// Proportions from the website logo:
// circle r=30 at (35,50), rect 25x25 at (70,20) in a 100x100 space
// Scale to 512: multiply by 5.12
// circle: cx=179, cy=256, r=154
// rect: x=358, y=102, w=128, h=128, rx=41
// Add padding: shift everything so it fits with breathing room

const svg = `<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Transparent background — macOS clips to rounded square -->

  <!-- Main purple circle (left-center) -->
  <circle cx="196" cy="296" r="168" fill="#8b5cf5"/>

  <!-- Smaller light accent rounded square (top-right, not overlapping) -->
  <rect x="338" y="96" width="138" height="138" rx="44" fill="#a5b4fc"/>
</svg>`

await sharp(Buffer.from(svg))
  .png()
  .toFile('resources/icon.png')

console.log('Icon generated: resources/icon.png')
