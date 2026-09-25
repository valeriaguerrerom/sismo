# Genera los assets del logo (ícono recortado y optimizado) a partir del PNG
# original de alta resolución. Recorta el margen transparente y exporta a
# varios tamaños para navbar/favicon.
Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot '..\public\images\logo-full.png'
$outDir  = Join-Path $PSScriptRoot '..\public\images'

$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $srcPath))

# --- Recorta el bounding box de los píxeles no transparentes ---
$minX = $src.Width; $minY = $src.Height; $maxX = 0; $maxY = 0
# Muestreo cada 2 px para acelerar (imagen 4697x5000)
for ($y = 0; $y -lt $src.Height; $y += 2) {
  for ($x = 0; $x -lt $src.Width; $x += 2) {
    $a = $src.GetPixel($x, $y).A
    if ($a -gt 16) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Output "bbox: $minX,$minY -> $maxX,$maxY"

# Cuadra el recorte (para un ícono cuadrado nítido) con un pequeño padding.
$bw = $maxX - $minX; $bh = $maxY - $minY
$side = [Math]::Max($bw, $bh)
$pad = [int]($side * 0.04)
$side = $side + $pad * 2
$cx = [int](($minX + $maxX) / 2); $cy = [int](($minY + $maxY) / 2)
$sx = [int]($cx - $side / 2); $sy = [int]($cy - $side / 2)

function Export-Icon($size, $path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.SmoothingMode = 'HighQuality'
  $destRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $g.DrawImage($src, $destRect, $sx, $sy, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "wrote $path ($size px)"
}

Export-Icon 512 (Join-Path $outDir 'logo-mark.png')
Export-Icon 180 (Join-Path $outDir 'apple-touch-icon.png')

$src.Dispose()
Write-Output 'done'

# --- Favicon SVG que incrusta el ícono recortado (base64) ---
# Así se mantiene un único favicon.svg (como antes) pero con el logo nuevo,
# nítido a cualquier tamaño porque el navegador reescala el PNG de 512 px.
$markPath = Resolve-Path (Join-Path $outDir 'logo-mark.png')
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($markPath))
$svg = @"
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#FAF6F2"/>
  <image href="data:image/png;base64,$b64" x="16" y="16" width="480" height="480"/>
</svg>
"@
$favPath = Join-Path $outDir '..\favicon.svg'
[IO.File]::WriteAllText((Join-Path (Split-Path $markPath) '..\favicon.svg'), $svg, [Text.Encoding]::UTF8)
Write-Output 'favicon.svg written'
