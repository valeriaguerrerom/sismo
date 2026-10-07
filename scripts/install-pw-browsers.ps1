# Descarga manual de los navegadores de Playwright con curl (sigue redirects 307
# a storage.googleapis.com, que el descargador interno de Playwright no maneja
# bien en esta red). Extrae cada zip en la carpeta de caché que Playwright espera
# y escribe el marcador de instalación. Idempotente: salta lo ya instalado.
$ErrorActionPreference = 'Stop'
$ProgressPreference   = 'SilentlyContinue'
$cache = Join-Path $env:LOCALAPPDATA 'ms-playwright'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$tmp = Join-Path $env:TEMP 'pw-dl'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# dir => url (nombres de carpeta tal como los nombra `playwright install --dry-run`)
$targets = [ordered]@{
  'chromium-1243'                = 'https://cdn.playwright.dev/builds/cft/153.0.8010.12/win64/chrome-win64.zip'
  'chromium_headless_shell-1243' = 'https://cdn.playwright.dev/builds/cft/153.0.8010.12/win64/chrome-headless-shell-win64.zip'
  # Rutas 'builds/' directas en cdn.playwright.dev (sin pasar por el host
  # prss.microsoft.com, que no resuelve por DNS en esta red).
  'firefox-1543'                 = 'https://cdn.playwright.dev/builds/firefox/1543/firefox-win64.zip'
  'webkit-2359'                  = 'https://cdn.playwright.dev/builds/webkit/2359/webkit-win64.zip'
  'ffmpeg-1011'                  = 'https://cdn.playwright.dev/builds/ffmpeg/1011/ffmpeg-win64.zip'
  'winldd-1007'                  = 'https://cdn.playwright.dev/builds/winldd/1007/winldd-win64.zip'
}

foreach ($name in $targets.Keys) {
  $dest = Join-Path $cache $name
  if (Test-Path (Join-Path $dest 'INSTALLATION_COMPLETE')) {
    Write-Host "ya instalado: $name"
    continue
  }
  $url = $targets[$name]
  $zip = Join-Path $tmp "$name.zip"
  Write-Host "descargando $name ..."
  # -L sigue redirects; --retry por si la red parpadea.
  curl.exe -sS -L --fail --retry 3 --retry-delay 2 -o $zip $url
  if ($LASTEXITCODE -ne 0) { throw "fallo la descarga de $name" }
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Write-Host "extrayendo $name ..."
  Expand-Archive -Path $zip -DestinationPath $dest -Force
  # Marcador que Playwright usa para considerar el navegador instalado.
  New-Item -ItemType File -Force -Path (Join-Path $dest 'INSTALLATION_COMPLETE') | Out-Null
  Remove-Item -Force $zip
  Write-Host "listo: $name"
}
Write-Host 'Todos los navegadores de Playwright quedaron instalados.'
