$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$brandDirectory = Join-Path $projectRoot 'assets/brand'
[System.IO.Directory]::CreateDirectory($brandDirectory) | Out-Null

# The same simple silhouette stays legible at 16px and at home-screen size.
$zPoints = @(19,17, 47,17, 47,23, 27,43, 46,43, 46,49, 17,49, 17,43, 37,23, 19,23)
$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="z" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#67b8ff"/><stop offset="1" stop-color="#57dcc8"/></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="#0d1825"/>
  <rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#2a4053"/>
  <path fill="url(#z)" d="M19 17h28v6L27 43h19v6H17v-6l20-20H19z"/>
</svg>
'@
[System.IO.File]::WriteAllText((Join-Path $brandDirectory 'zhen.svg'), $svg, [System.Text.UTF8Encoding]::new($false))

function New-IconPng([int]$Size) {
    $canvas = [System.Drawing.Bitmap]::new($Size * 4, $Size * 4)
    $drawing = [System.Drawing.Graphics]::FromImage($canvas)
    $drawing.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $drawing.ScaleTransform($Size / 16.0, $Size / 16.0)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    foreach ($arc in @(@(0,0,180), @(36,0,270), @(36,36,0), @(0,36,90))) {
        $path.AddArc($arc[0], $arc[1], 28, 28, $arc[2], 90)
    }
    $path.CloseFigure()
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0d1825'))
    $border = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#2a4053'), 1)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Point]::new(17,17), [System.Drawing.Point]::new(47,49),
        [System.Drawing.ColorTranslator]::FromHtml('#67b8ff'), [System.Drawing.ColorTranslator]::FromHtml('#57dcc8'))
    $drawing.FillPath($background, $path)
    $drawing.DrawPath($border, $path)
    $points = for ($i=0; $i -lt $zPoints.Length; $i+=2) { [System.Drawing.PointF]::new($zPoints[$i], $zPoints[$i+1]) }
    $drawing.FillPolygon($gradient, [System.Drawing.PointF[]]$points)
    $resized = [System.Drawing.Bitmap]::new($Size, $Size)
    $resizeDrawing = [System.Drawing.Graphics]::FromImage($resized)
    $resizeDrawing.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resizeDrawing.DrawImage($canvas, 0, 0, $Size, $Size)
    $stream = [System.IO.MemoryStream]::new()
    $resized.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $stream.ToArray()
    foreach ($resource in @($drawing,$resizeDrawing,$canvas,$resized,$path,$background,$border,$gradient,$stream)) { $resource.Dispose() }
    return ,$bytes
}

[System.IO.File]::WriteAllBytes((Join-Path $brandDirectory 'zhen-180.png'), (New-IconPng 180))
$sizes = @(16,32,48)
$images = foreach ($size in $sizes) { ,(New-IconPng $size) }
$icoStream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($icoStream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Length)
$offset = 6 + 16 * $sizes.Length
for ($i=0; $i -lt $sizes.Length; $i++) {
    $writer.Write([byte]$sizes[$i]); $writer.Write([byte]$sizes[$i]); $writer.Write([uint16]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $projectRoot 'favicon.ico'), $icoStream.ToArray())
$writer.Dispose(); $icoStream.Dispose()
Write-Output 'Built Zhen SVG, 16/32/48px ICO and 180px touch icon.'
