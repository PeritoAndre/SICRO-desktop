//! G12.1 — Detecção de bordas (Sobel, Laplacian, Canny).
//!
//! Filtros forenses fundamentais: realçam transições de intensidade,
//! úteis para destacar contornos de placas, marcações, objetos sob
//! análise. Trabalham na luminância (0.299R + 0.587G + 0.114B) e
//! retornam imagem grayscale colorizada (R=G=B).

use image::{Rgba, RgbaImage};

/// Converte um pixel RGBA para luminância (BT.601).
#[inline]
fn lum(p: Rgba<u8>) -> f32 {
    0.299 * p.0[0] as f32 + 0.587 * p.0[1] as f32 + 0.114 * p.0[2] as f32
}

/// Sobel — magnitude do gradiente. `strength` multiplica o resultado
/// antes de clipar em 0..255.
///
/// Kernel Gx:           Kernel Gy:
/// [-1  0  1]           [-1 -2 -1]
/// [-2  0  2]           [ 0  0  0]
/// [-1  0  1]           [ 1  2  1]
pub fn sobel(img: &RgbaImage, strength: f32) -> RgbaImage {
    let w = img.width() as i32;
    let h = img.height() as i32;
    let mut out = RgbaImage::new(w as u32, h as u32);
    let s = strength.clamp(0.0, 4.0);

    for y in 0..h {
        for x in 0..w {
            let mut gx = 0.0_f32;
            let mut gy = 0.0_f32;
            for dy in -1..=1_i32 {
                for dx in -1..=1_i32 {
                    let xx = (x + dx).clamp(0, w - 1) as u32;
                    let yy = (y + dy).clamp(0, h - 1) as u32;
                    let l = lum(*img.get_pixel(xx, yy));
                    let kgx = match (dx, dy) {
                        (-1, -1) => -1.0,
                        (-1, 0) => -2.0,
                        (-1, 1) => -1.0,
                        (1, -1) => 1.0,
                        (1, 0) => 2.0,
                        (1, 1) => 1.0,
                        _ => 0.0,
                    };
                    let kgy = match (dx, dy) {
                        (-1, -1) => -1.0,
                        (0, -1) => -2.0,
                        (1, -1) => -1.0,
                        (-1, 1) => 1.0,
                        (0, 1) => 2.0,
                        (1, 1) => 1.0,
                        _ => 0.0,
                    };
                    gx += l * kgx;
                    gy += l * kgy;
                }
            }
            let mag = (gx * gx + gy * gy).sqrt() * s;
            let v = mag.clamp(0.0, 255.0) as u8;
            let a = img.get_pixel(x as u32, y as u32).0[3];
            out.put_pixel(x as u32, y as u32, Rgba([v, v, v, a]));
        }
    }
    out
}

/// Laplaciano 5x5 — detector de bordas isotrópico (segunda derivada).
///
/// Kernel (5x5, soma zero):
/// [ 0  0 -1  0  0]
/// [ 0 -1 -2 -1  0]
/// [-1 -2 16 -2 -1]
/// [ 0 -1 -2 -1  0]
/// [ 0  0 -1  0  0]
pub fn laplacian(img: &RgbaImage, strength: f32) -> RgbaImage {
    let w = img.width() as i32;
    let h = img.height() as i32;
    let mut out = RgbaImage::new(w as u32, h as u32);
    let s = strength.clamp(0.0, 4.0);

    let kernel: [[f32; 5]; 5] = [
        [0.0, 0.0, -1.0, 0.0, 0.0],
        [0.0, -1.0, -2.0, -1.0, 0.0],
        [-1.0, -2.0, 16.0, -2.0, -1.0],
        [0.0, -1.0, -2.0, -1.0, 0.0],
        [0.0, 0.0, -1.0, 0.0, 0.0],
    ];

    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0_f32;
            for ky in 0..5_i32 {
                for kx in 0..5_i32 {
                    let xx = (x + kx - 2).clamp(0, w - 1) as u32;
                    let yy = (y + ky - 2).clamp(0, h - 1) as u32;
                    acc += lum(*img.get_pixel(xx, yy)) * kernel[ky as usize][kx as usize];
                }
            }
            let v = (acc.abs() * s).clamp(0.0, 255.0) as u8;
            let a = img.get_pixel(x as u32, y as u32).0[3];
            out.put_pixel(x as u32, y as u32, Rgba([v, v, v, a]));
        }
    }
    out
}

/// Canny simplificado — Sobel + non-max suppression + double threshold + hysteresis.
///
/// Versão didática (não otimizada). O output é binário: 0 ou 255.
/// `low_threshold` e `high_threshold` em escala 0..255.
pub fn canny(img: &RgbaImage, low_threshold: f32, high_threshold: f32) -> RgbaImage {
    let w = img.width() as usize;
    let h = img.height() as usize;
    let lo = low_threshold.clamp(0.0, 255.0);
    let hi = high_threshold.clamp(lo + 1.0, 255.0);

    // 1. Gaussian blur leve para reduzir ruído (sigma=1, kernel 3x3 aprox).
    let smooth = super::blur::gaussian(img, 1.0);

    // 2. Sobel gradient magnitude + direction.
    let mut mag = vec![0.0_f32; w * h];
    let mut dir = vec![0.0_f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut gx = 0.0_f32;
            let mut gy = 0.0_f32;
            for dy in -1..=1_i32 {
                for dx in -1..=1_i32 {
                    let xx = (x as i32 + dx).clamp(0, w as i32 - 1) as u32;
                    let yy = (y as i32 + dy).clamp(0, h as i32 - 1) as u32;
                    let l = lum(*smooth.get_pixel(xx, yy));
                    let kgx = match (dx, dy) {
                        (-1, -1) | (-1, 1) => -1.0,
                        (-1, 0) => -2.0,
                        (1, -1) | (1, 1) => 1.0,
                        (1, 0) => 2.0,
                        _ => 0.0,
                    };
                    let kgy = match (dx, dy) {
                        (-1, -1) | (1, -1) => -1.0,
                        (0, -1) => -2.0,
                        (-1, 1) | (1, 1) => 1.0,
                        (0, 1) => 2.0,
                        _ => 0.0,
                    };
                    gx += l * kgx;
                    gy += l * kgy;
                }
            }
            mag[y * w + x] = (gx * gx + gy * gy).sqrt();
            dir[y * w + x] = gy.atan2(gx);
        }
    }

    // 3. Non-max suppression — bin direção em 4 ângulos.
    let mut suppressed = vec![0.0_f32; w * h];
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let i = y * w + x;
            let angle = dir[i].to_degrees().rem_euclid(180.0);
            let m = mag[i];
            let (n1, n2) = if (0.0..22.5).contains(&angle) || (157.5..180.0).contains(&angle) {
                (mag[i - 1], mag[i + 1])
            } else if (22.5..67.5).contains(&angle) {
                (mag[i - w + 1], mag[i + w - 1])
            } else if (67.5..112.5).contains(&angle) {
                (mag[i - w], mag[i + w])
            } else {
                (mag[i - w - 1], mag[i + w + 1])
            };
            suppressed[i] = if m >= n1 && m >= n2 { m } else { 0.0 };
        }
    }

    // 4. Double threshold + hysteresis (simplificado: pixel >= hi sempre forte,
    //    pixel entre lo..hi conectado a forte fica como forte).
    let mut out = RgbaImage::new(w as u32, h as u32);
    let mut strong = vec![false; w * h];
    for i in 0..w * h {
        if suppressed[i] >= hi {
            strong[i] = true;
        }
    }
    // Propagação simples (1 passada): pixel "fraco" (>= lo) com vizinho forte vira forte.
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let i = y * w + x;
            if strong[i] {
                continue;
            }
            if suppressed[i] >= lo {
                let has_strong_neighbor = strong[i - 1]
                    || strong[i + 1]
                    || strong[i - w]
                    || strong[i + w]
                    || strong[i - w - 1]
                    || strong[i - w + 1]
                    || strong[i + w - 1]
                    || strong[i + w + 1];
                if has_strong_neighbor {
                    strong[i] = true;
                }
            }
        }
    }
    for y in 0..h {
        for x in 0..w {
            let v = if strong[y * w + x] { 255_u8 } else { 0_u8 };
            let a = img.get_pixel(x as u32, y as u32).0[3];
            out.put_pixel(x as u32, y as u32, Rgba([v, v, v, a]));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn black_with_white_center() -> RgbaImage {
        let mut img = RgbaImage::from_pixel(5, 5, Rgba([0, 0, 0, 255]));
        img.put_pixel(2, 2, Rgba([255, 255, 255, 255]));
        img
    }

    #[test]
    fn sobel_responds_around_isolated_bright_pixel() {
        let img = black_with_white_center();
        let out = sobel(&img, 1.0);
        // O pixel central, sem vizinhos brilhantes laterais, tem gradiente 0.
        // Os pixels nas bordas do quadrado 3x3 ao redor têm gradiente alto.
        let around = out.get_pixel(2, 1).0[0];
        assert!(around > 50, "vizinho do pixel branco deveria ter borda");
    }

    #[test]
    fn laplacian_isotropic_response() {
        let img = black_with_white_center();
        let out = laplacian(&img, 1.0);
        // Pixel central: o laplaciano vale 16 * 255 -> clipa em 255.
        // Vizinhos diagonais 1+: têm resposta moderada.
        assert_eq!(out.get_pixel(2, 2).0[0], 255);
    }

    #[test]
    fn canny_threshold_filters_low_intensity_edges() {
        let img = black_with_white_center();
        let out = canny(&img, 50.0, 150.0);
        // Output é binário 0/255.
        for p in out.pixels() {
            assert!(p.0[0] == 0 || p.0[0] == 255);
        }
    }
}
