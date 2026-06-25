Add-Type -AssemblyName System.Drawing

# ── CONFIGURACION ──────────────────────────────────────────────────────────────
$base    = "c:\Users\Nacho\Plataforma CUBO\Instagram Post"
$out     = "$base\Posts Generados"
$fontDir = "$base\Fuentes"
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

$SZ       = 1080
$CREAM    = [System.Drawing.Color]::FromArgb(251,249,249)   # #FBF9F9
$CHARCOAL = [System.Drawing.Color]::FromArgb(27,28,28)      # #1B1C1C
$GREY     = [System.Drawing.Color]::FromArgb(150,152,152)   # gris medio para labels
$GREY2    = [System.Drawing.Color]::FromArgb(196,199,199)   # gris claro watermark

# ── FUENTES ────────────────────────────────────────────────────────────────────
# Verificar si Space Grotesk esta instalada en el sistema
$hasSpaceGrotesk = [bool]([System.Drawing.FontFamily]::Families | Where-Object { $_.Name -match "Space Grotesk" })
$headlineFace    = if ($hasSpaceGrotesk) { "Space Grotesk" } else { "Arial" }
$bodyFace        = "Inter"   # via PrivateFontCollection
Write-Host "Titular: $headlineFace | Cuerpo: $bodyFace"

# Cargar Inter desde archivo (para usar por nombre en las funciones)
$pfc = [System.Drawing.Text.PrivateFontCollection]::new()
$pfc.AddFontFile("$fontDir\Inter-Regular.ttf")
$pfc.AddFontFile("$fontDir\Inter-Bold.ttf")
$pfc.AddFontFile("$fontDir\Inter-Light.ttf")
$pfc.AddFontFile("$fontDir\Inter-Medium.ttf")

# Obtener familias de PFC por nombre
function Get-PFCFamily { param($name)
  $fam = $pfc.Families | Where-Object { $_.Name -eq $name } | Select-Object -First 1
  return $fam
}
$interRegFamily = Get-PFCFamily "Inter"
$interLitFamily = Get-PFCFamily "Inter Light"  # Light si esta disponible

# ── HELPERS ────────────────────────────────────────────────────────────────────
function New-Canvas { param([System.Drawing.Color]$bg)
  $bmp = [System.Drawing.Bitmap]::new($SZ,$SZ)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear($bg)
  return @{bmp=$bmp; g=$g}
}

# Fuente headline: usa Space Grotesk si esta instalada, sino Arial Black
function HF { param([float]$sz, [bool]$bold=$true)
  if ($hasSpaceGrotesk) {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    return [System.Drawing.Font]::new($headlineFace, $sz, $style)
  } else {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    return [System.Drawing.Font]::new("Arial Black", $sz, $style)
  }
}

# Fuente cuerpo: Inter desde PFC
function BF { param([float]$sz, [bool]$bold=$false, [bool]$light=$false)
  if ($light -and $interLitFamily) {
    return [System.Drawing.Font]::new($interLitFamily, $sz, [System.Drawing.FontStyle]::Regular)
  } elseif ($bold -and $interRegFamily) {
    return [System.Drawing.Font]::new($interRegFamily, $sz, [System.Drawing.FontStyle]::Bold)
  } elseif ($interRegFamily) {
    return [System.Drawing.Font]::new($interRegFamily, $sz, [System.Drawing.FontStyle]::Regular)
  } else {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    return [System.Drawing.Font]::new("Segoe UI", $sz, $style)
  }
}

function Draw-Txt {
  param($g, [string]$txt, [System.Drawing.Font]$f, [System.Drawing.Color]$col,
        [int]$x, [int]$y, [int]$w, [int]$h, [string]$align="L")
  $br = [System.Drawing.SolidBrush]::new($col)
  $sf = [System.Drawing.StringFormat]::new()
  $sf.Alignment = switch ($align) {
    "C" { [System.Drawing.StringAlignment]::Center }
    "R" { [System.Drawing.StringAlignment]::Far }
    default { [System.Drawing.StringAlignment]::Near }
  }
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Near
  $g.DrawString($txt, $f, $br, [System.Drawing.RectangleF]::new($x,$y,$w,$h), $sf)
  $measured = $g.MeasureString($txt, $f, $w)
  $br.Dispose(); $sf.Dispose()
  return [int]$measured.Height
}

function Draw-Line { param($g,[int]$x1,[int]$y1,[int]$x2,[int]$y2,[System.Drawing.Color]$col,[float]$w=2)
  $p = [System.Drawing.Pen]::new($col,$w); $g.DrawLine($p,$x1,$y1,$x2,$y2); $p.Dispose()
}

function Add-Wm { param($g)
  $f  = BF 11; $br = [System.Drawing.SolidBrush]::new($GREY2)
  $sf = [System.Drawing.StringFormat]::new()
  $sf.Alignment = [System.Drawing.StringAlignment]::Far
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Far
  $wm = [char]0x039B + "3"
  $g.DrawString($wm, $f, $br, [System.Drawing.RectangleF]::new(0,0,($SZ-20),($SZ-20)), $sf)
  $f.Dispose(); $br.Dispose(); $sf.Dispose()
}

function Save-Slide { param($cv,$path)
  Add-Wm $cv.g
  $cv.bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $cv.g.Dispose(); $cv.bmp.Dispose()
  Write-Host "  -> $([System.IO.Path]::GetFileName($path))"
}

function Make-Photo { param([string]$src,[float]$alpha=0.0)
  $img = [System.Drawing.Image]::FromFile($src)
  $bmp = [System.Drawing.Bitmap]::new($SZ,$SZ)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $sw=$img.Width; $sh=$img.Height
  if (($sw/$sh) -gt 1.0) { $nw=[int]$sh; $nh=[int]$sh; $sx=[int](($sw-$nw)/2); $sy=0 }
  else                    { $nw=[int]$sw; $nh=[int]$sw; $sx=0; $sy=[int](($sh-$nh)/2) }
  $g.DrawImage($img,
    [System.Drawing.Rectangle]::new(0,0,$SZ,$SZ),
    [System.Drawing.Rectangle]::new($sx,$sy,$nw,$nh),
    [System.Drawing.GraphicsUnit]::Pixel)
  $img.Dispose(); $g.Dispose()
  if ($alpha -gt 0) {
    $g2 = [System.Drawing.Graphics]::FromImage($bmp)
    $br = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb([int]($alpha*255),27,28,28))
    $g2.FillRectangle($br,0,0,$SZ,$SZ); $br.Dispose(); $g2.Dispose()
  }
  return $bmp
}

# Slide con foto de fondo + overlay
function Photo-Slide {
  param([string]$path,[string]$src,[float]$ov=0.55,
        [string]$label="", [string]$title="", [float]$tSz=88, [string]$sub="", [float]$sSz=62)
  $bmp = Make-Photo $src $ov
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $pad = 72
  $W   = $SZ - $pad*2
  if ($label) {
    $f = BF 11
    Draw-Txt $g $label.ToUpper() $f $GREY2 $pad 52 $W 30 "L" | Out-Null
    $f.Dispose()
  }
  Draw-Line $g $pad 94 ($pad+40) 94 $CREAM 1.5
  $y = 112
  if ($title) {
    $f = HF $tSz $true
    $h = Draw-Txt $g $title $f $CREAM $pad $y $W 400 "L"
    $f.Dispose()
    $y += $h - [int]($tSz * 0.2)
  }
  if ($sub) {
    $f = HF $sSz $false
    $cSub = [System.Drawing.Color]::FromArgb(170,251,249,249)
    Draw-Txt $g $sub $f $cSub $pad $y $W 300 "L" | Out-Null
    $f.Dispose()
  }
  $cv = @{bmp=$bmp; g=$g}
  Save-Slide $cv $path
}

# Slide de texto: titleA = heroe (grande bold), titleB = secundario (chico regular semitransparente)
# Posicionamiento dinamico encadenado con MeasureString — sin superposicion posible
function Text-Slide {
  param(
    [string]$path,
    [System.Drawing.Color]$bg,
    [System.Drawing.Color]$fg,
    [string]$label="",
    [string]$titleA="",
    [string]$titleB="",
    [string]$titleC="",
    [float]$titleSz=80,
    [string]$body="",
    [float]$bodySz=22,
    [string]$cta=""
  )
  $cv  = New-Canvas $bg
  $g   = $cv.g
  $pad = 72
  $W   = $SZ - $pad*2

  if ($label) {
    $f = BF 11
    Draw-Txt $g $label.ToUpper() $f $GREY $pad 52 $W 30 "L" | Out-Null
    $f.Dispose()
  }
  Draw-Line $g $pad 94 ($pad+40) 94 $fg 1.5

  $y = 112

  # titleA: heroe — bold, opacidad completa
  if ($titleA) {
    $f  = HF $titleSz $true
    $h  = Draw-Txt $g $titleA $f $fg $pad $y $W 500 "L"
    $f.Dispose()
    $y += $h - [int]($titleSz * 0.22)
  }

  # titleB: secundario — regular, semitransparente, 65% del tamano
  if ($titleB) {
    $szB = [float]($titleSz * 0.65)
    $f   = HF $szB $false
    $cB  = [System.Drawing.Color]::FromArgb(150, $fg.R, $fg.G, $fg.B)
    $h   = Draw-Txt $g $titleB $f $cB $pad $y $W 400 "L"
    $f.Dispose()
    $y += $h - [int]($szB * 0.15)
  }

  # titleC: terciario — regular, mas transparente, 48% del tamano
  if ($titleC) {
    $szC = [float]($titleSz * 0.48)
    $f   = HF $szC $false
    $cC  = [System.Drawing.Color]::FromArgb(110, $fg.R, $fg.G, $fg.B)
    Draw-Txt $g $titleC $f $cC $pad $y $W 300 "L" | Out-Null
    $f.Dispose()
  }

  # Zona inferior fija: separador + body + cta
  if ($body -or $cta) {
    Draw-Line $g $pad 748 ($SZ-$pad) 748 ([System.Drawing.Color]::FromArgb(45,$fg.R,$fg.G,$fg.B)) 1
  }
  if ($body) {
    $f  = BF $bodySz $false
    $cBody = [System.Drawing.Color]::FromArgb(120, $fg.R, $fg.G, $fg.B)
    Draw-Txt $g $body $f $cBody $pad 762 $W 160 "L" | Out-Null
    $f.Dispose()
  }
  if ($cta) {
    $f  = BF 18 $true
    $cCta = [System.Drawing.Color]::FromArgb(210, $fg.R, $fg.G, $fg.B)
    Draw-Txt $g $cta $f $cCta $pad 876 $W 60 "L" | Out-Null
    $f.Dispose()
  }

  Save-Slide $cv $path
}

# Slide numerado: numero es el heroe visual. Ghost = textura de fondo sutil
function Number-Slide {
  param([string]$path,[System.Drawing.Color]$bg,[System.Drawing.Color]$fg,
        [string]$num,[string]$label,[string]$body,[float]$bodySz=26)
  $cv  = New-Canvas $bg
  $g   = $cv.g
  $pad = 72
  $W   = $SZ - $pad*2

  # Ghost: textura sutil, muy transparente, desbordado para no pisar texto
  $ghost  = [System.Drawing.Color]::FromArgb(18,$fg.R,$fg.G,$fg.B)
  $fGhost = HF 420 $true
  $sfR = [System.Drawing.StringFormat]::new()
  $sfR.Alignment     = [System.Drawing.StringAlignment]::Far
  $sfR.LineAlignment = [System.Drawing.StringAlignment]::Far
  $g.DrawString($num, $fGhost, [System.Drawing.SolidBrush]::new($ghost),
    [System.Drawing.RectangleF]::new(-60,-60,($SZ+60),($SZ+60)), $sfR)
  $fGhost.Dispose(); $sfR.Dispose()

  # Label superior pequeno
  $fL = BF 11
  Draw-Txt $g $label.ToUpper() $fL $GREY $pad 52 $W 30 "L" | Out-Null
  $fL.Dispose()
  Draw-Line $g $pad 94 ($pad+40) 94 $fg 1.5

  # Numero: el heroe — grande, limpio
  $y = 112
  $fNum = HF 140 $true
  $h1   = Draw-Txt $g $num $fNum $fg $pad $y $W 300 "L"
  $fNum.Dispose()
  $y += $h1 - 18

  # Cuerpo como subtitulo secundario debajo del numero
  if ($body) {
    $fB = HF 46 $false
    $cB = [System.Drawing.Color]::FromArgb(150,$fg.R,$fg.G,$fg.B)
    Draw-Txt $g $body $fB $cB $pad $y $W 400 "L" | Out-Null
    $fB.Dispose()
  }

  Save-Slide $cv $path
}

# Slide de precio: dato grande es el heroe, rango secundario, nota como contexto chico
function Stat-Slide {
  param([string]$path,[System.Drawing.Color]$bg,[System.Drawing.Color]$fg,
        [string]$label,[string]$statBig,[string]$statSmall,[string]$note="")
  $cv  = New-Canvas $bg
  $g   = $cv.g
  $pad = 72
  $W   = $SZ - $pad*2

  $fL = BF 11
  Draw-Txt $g $label.ToUpper() $fL $GREY $pad 52 $W 30 "L" | Out-Null
  $fL.Dispose()
  Draw-Line $g $pad 94 ($pad+40) 94 $fg 1.5

  # Dato principal: heroe
  $y  = 112
  $fS = HF 110 $true
  $h1 = Draw-Txt $g $statBig $fS $fg $pad $y $W 260 "L"
  $fS.Dispose()
  $y += $h1 - 20

  # Rango secundario: regular, semitransparente
  $fSm = HF 52 $false
  $cSm = [System.Drawing.Color]::FromArgb(150,$fg.R,$fg.G,$fg.B)
  $h2  = Draw-Txt $g $statSmall $fSm $cSm $pad $y $W 120 "L"
  $fSm.Dispose()
  $y += $h2 + 10

  # Nota: contexto chico en la zona inferior
  if ($note) {
    Draw-Line $g $pad 748 ($SZ-$pad) 748 ([System.Drawing.Color]::FromArgb(40,$fg.R,$fg.G,$fg.B)) 1
    $fN = BF 20 $false $true
    $cN = [System.Drawing.Color]::FromArgb(120,$fg.R,$fg.G,$fg.B)
    Draw-Txt $g $note $fN $cN $pad 762 $W 100 "L" | Out-Null
    $fN.Dispose()
  }
  Save-Slide $cv $path
}

# ── DIRECTORIOS DE SALIDA ──────────────────────────────────────────────────────
$p1 = "$out\Post1_EsCUBO";         New-Item -ItemType Directory -Force -Path $p1 | Out-Null
$p2 = "$out\Post2_DeptoGonza";     New-Item -ItemType Directory -Force -Path $p2 | Out-Null
$p3 = "$out\Post3_CasaBenavidez";  New-Item -ItemType Directory -Force -Path $p3 | Out-Null
$p4 = "$out\Post4_ComoTrabajamos"; New-Item -ItemType Directory -Force -Path $p4 | Out-Null
$p5 = "$out\Post5_Precio";         New-Item -ItemType Directory -Force -Path $p5 | Out-Null
$p6 = "$out\Post6_CTA";            New-Item -ItemType Directory -Force -Path $p6 | Out-Null
$CB = "$base\Casa Benavidez"
$DG = "$base\Depto Gonza"

# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPost 1 — Esto es CUBO"

# 1. Portada: foto con overlay, titulo editorial
Photo-Slide "$p1\01_portada.jpg" "$CB\IMG_9583.JPEG" 0.60 `
  "CUBO — Buenos Aires" "CONSTRUIMOS" 88 "tu vision."

# 2. Nos ocupamos
Text-Slide "$p1\02_servicios.jpg" $CREAM $CHARCOAL `
  -label "Lo que hacemos" `
  -titleA "Nos ocupamos" `
  -titleB "de todo." `
  -titleSz 82 `
  -body "Proyecto  /  Gestiones municipales  /  Direccion de obra  /  Administracion  /  Construccion" `
  -bodySz 20 `
  -cta "Vos solo aprobas y nos vemos en la entrega."

# 3. Quienes somos
Text-Slide "$p1\03_quienes.jpg" $CHARCOAL $CREAM `
  -label "El equipo" `
  -titleA "Nacho y Gonzalo." `
  -titleB "" `
  -titleSz 72 `
  -body "6 y 8 años en la industria. Dirección de obra, presupuestos y gestiones desde adentro. Obras integrales en CABA y GBA Norte." `
  -bodySz 24

# 4. Sin sorpresas
Text-Slide "$p1\04_promesa.jpg" $CREAM $CHARCOAL `
  -label "Nuestra promesa" `
  -titleA "Sin sorpresas" `
  -titleB "en el presupuesto." `
  -titleSz 72 `
  -body "Un solo equipo. Un solo interlocutor. De principio a fin." `
  -bodySz 26

# 5. 05 etapas
Number-Slide "$p1\05_etapas.jpg" $CHARCOAL $CREAM "05" `
  "etapas de una obra llave en mano" `
  "Proyecto  Gestiones  Direccion  Administracion  Construccion" 24

# 6. CTA
Text-Slide "$p1\06_cta.jpg" $CREAM $CHARCOAL `
  -label "Empeza ahora" `
  -titleA "Cotiza tu reforma" `
  -titleB "en 5 minutos." `
  -titleSz 72 `
  -body "Sin llamadas. Sin compromisos." `
  -bodySz 26 `
  -cta "> Link en bio"

# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPost 2 — Depto Gonza Antes/Despues"

Photo-Slide "$p2\01_portada.jpg" "$DG\32ee8145-770a-4062-86f0-59555e2aff45.jpg" 0.52 `
  "Depto — CABA" "Antes y despues." 76

Photo-Slide "$p2\02_antes_cocina.jpg" "$DG\243e32da-5994-4f7b-bcef-9de7bb83de34.jpg" 0.10 "ANTES" "" 0

Photo-Slide "$p2\03_despues_cocina.jpg" "$DG\eeeede66-6e75-4c17-822b-8d8639799d90.jpg" 0.10 "DESPUES" "" 0

Photo-Slide "$p2\04_antes_bano.jpg" "$DG\52d8ceb1-b4fa-4fd6-8be4-80fda75b911e.jpg" 0.10 "ANTES" "" 0

Photo-Slide "$p2\05_despues_bano.jpg" "$DG\5bd9c8e7-7413-41e8-bdf8-9d39e6038b41.jpg" 0.10 "DESPUES" "" 0

Text-Slide "$p2\06_cierre.jpg" $CHARCOAL $CREAM `
  -label "Reforma integral completa" `
  -titleA "Llave en mano." `
  -titleSz 88 `
  -cta "> Cotiza tu reforma en el link de bio"

# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPost 3 — Casa Benavidez El Proceso"

Photo-Slide "$p3\01_portada.jpg" "$CB\IMG_8375.JPEG" 0.55 `
  "Casa — Benavidez" "Asi se ve una obra por dentro." 62

Photo-Slide "$p3\02_inicio.jpg"   "$CB\14e94101-a792-46e4-8791-441707c6ada1.jpg" 0.12 "ESTADO INICIAL"
Photo-Slide "$p3\03_proceso.jpg"  "$CB\E73C5099-E52A-4B3E-9BF7-BFA5D317AB3D.jpg" 0.12 "EN PROCESO"
Photo-Slide "$p3\04_detalle.jpg"  "$CB\22A992D1-9232-4627-A36E-21C9FE3508D0.jpg" 0.12 "DETALLE TECNICO"
Photo-Slide "$p3\05_fachada.jpg"  "$CB\IMG_8376.JPEG"  0.10 "RESULTADO FINAL"
Photo-Slide "$p3\06_cocina.jpg"   "$CB\IMG_9583.JPEG"  0.10 "RESULTADO FINAL"

Text-Slide "$p3\07_cierre.jpg" $CHARCOAL $CREAM `
  -label "El diferencial CUBO" `
  -titleA "Sin desaparecer." `
  -titleB "Sin excusas." `
  -titleSz 76 `
  -body "Llave en mano significa que el problema es nuestro, no tuyo." `
  -bodySz 24 `
  -cta "> Cotiza tu obra en el link de bio"

# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPost 4 — Como trabajamos"

Text-Slide "$p4\01_portada.jpg" $CHARCOAL $CREAM `
  -label "Guarda esto antes de contratar" `
  -titleA "Las 5 etapas" `
  -titleB "de una obra llave en mano." `
  -titleSz 72

$etapas = @(
  ,@("01","PROYECTO Y DISENO",   "Planos, renders y definicion de materiales antes de mover un solo ladrillo.",$CREAM,$CHARCOAL)
  ,@("02","GESTIONES MUNICIPALES","Permisos, planos de obra, habilitaciones. Nos ocupamos nosotros. Vos no haces nada.",$CHARCOAL,$CREAM)
  ,@("03","DIRECCION DE OBRA",   "Un director de obra en el lugar todos los dias. Reportes semanales para vos.",$CREAM,$CHARCOAL)
  ,@("04","ADMINISTRACION",      "Presupuesto cerrado. Control de gastos en tiempo real. Sin sorpresas al final.",$CHARCOAL,$CREAM)
  ,@("05","CONSTRUCCION",        "Equipo propio. Sin tercerizar lo critico. Calidad controlada en cada detalle.",$CREAM,$CHARCOAL)
)
$idx = 2
foreach ($e in $etapas) {
  Number-Slide "$p4\0${idx}_etapa.jpg" $e[3] $e[4] $e[0] $e[1] $e[2] 26
  $idx++
}

Text-Slide "$p4\07_cta.jpg" $CREAM $CHARCOAL `
  -label "Empeza ahora" `
  -titleA "Cuanto cuesta" `
  -titleB "tu reforma?" `
  -titleSz 78 `
  -body "Cotiza online en 5 minutos. Sin llamadas. Sin compromiso." `
  -bodySz 24 `
  -cta "> Link en bio"

# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPost 5 — Cuanto cuesta una reforma"

Text-Slide "$p5\01_portada.jpg" $CHARCOAL $CREAM `
  -label "La respuesta honesta" `
  -titleA "Cuanto cuesta" `
  -titleB "reformar un depto" `
  -titleC "en Buenos Aires?" `
  -titleSz 74

Text-Slide "$p5\02_depende.jpg" $CREAM $CHARCOAL `
  -label "La respuesta corta" `
  -titleA "Depende." `
  -titleSz 96 `
  -body "Pero hay rangos reales que podemos darte." `
  -bodySz 28

Stat-Slide "$p5\03_parcial.jpg" $CREAM $CHARCOAL `
  -label "Reforma parcial — bano o cocina" `
  -statBig "USD 8k" `
  -statSmall "a USD 18.000" `
  -note "Segun terminaciones y complejidad."

Stat-Slide "$p5\04_integral.jpg" $CHARCOAL $CREAM `
  -label "Reforma integral — 2 o 3 ambientes" `
  -statBig "USD 20k" `
  -statSmall "a USD 50.000" `
  -note "Incluye proyecto, materiales y mano de obra."

Text-Slide "$p5\05_depende.jpg" $CREAM $CHARCOAL `
  -label "De que depende el precio?" `
  -titleA "Materiales" `
  -titleB "y proceso." `
  -titleSz 78 `
  -body "Estado inicial  /  Complejidad de instalaciones  /  Cambios de distribucion  /  Calidad elegida  /  Plazos de entrega" `
  -bodySz 20

Text-Slide "$p5\06_promesa.jpg" $CHARCOAL $CREAM `
  -label "Lo que si podemos prometerte" `
  -titleA "El precio que acordamos" `
  -titleB "es el precio final." `
  -titleSz 68 `
  -body "Sin sorpresas. Sin adicionales que no sabias." `
  -bodySz 26

Text-Slide "$p5\07_cta.jpg" $CREAM $CHARCOAL `
  -label "Queres saber el numero de tu proyecto?" `
  -titleA "Cotiza online" `
  -titleB "en 5 minutos." `
  -titleSz 80 `
  -body "Sin llamadas. Sin compromiso." `
  -bodySz 26 `
  -cta "> Link en bio"

# ═══════════════════════════════════════════════════════════════════════════════
Write-Host "`nPost 6 — CTA Cotizador"

Photo-Slide "$p6\01_portada.jpg" "$CB\IMG_9587.JPEG" 0.65 `
  "CUBO — Cotizador online" "Tu reforma. Tu presupuesto." 68 "En 5 minutos." 30

Text-Slide "$p6\02_como.jpg" $CREAM $CHARCOAL `
  -label "Como funciona" `
  -titleA "Seleccionas los trabajos." `
  -titleSz 66 `
  -body "El cotizador calcula el total en tiempo real.`nSin hablar con nadie. Sin esperar respuesta." `
  -bodySz 26

Text-Slide "$p6\03_cta.jpg" $CHARCOAL $CREAM `
  -label "Empeza ahora" `
  -titleA "Listo para ver" `
  -titleB "el numero?" `
  -titleSz 84 `
  -cta "> Link en bio"

# ── RESUMEN ────────────────────────────────────────────────────────────────────
$pfc.Dispose()
Write-Host "`nListo."
$total = (Get-ChildItem $out -Recurse -Filter "*.jpg").Count
Write-Host "Total slides: $total"
Get-ChildItem $out | Sort-Object Name | ForEach-Object {
  $n = (Get-ChildItem $_.FullName -Filter "*.jpg").Count
  Write-Host "  $($_.Name): $n slides"
}
if (-not $hasSpaceGrotesk) {
  Write-Host "`nNOTA: Space Grotesk NO esta instalada. Titulares en Arial."
  Write-Host "Para instalar: doble click en Fuentes\SpaceGrotesk-Bold.ttf -> Instalar"
  Write-Host "Luego corre el script de nuevo para regenerar con la fuente correcta."
}
