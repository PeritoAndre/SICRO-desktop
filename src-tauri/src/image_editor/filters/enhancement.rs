//! G12.3 / G12.5 — Realce de imagem: CLAHE, Histogram EQ, Auto-Levels,
//! White Balance.
//!
//! CLAHE (Contrast-Limited Adaptive Histogram Equalization) é o realce
//! local mais usado em forense — divide a imagem em tiles, equaliza
//! cada tile, faz blend bilinear nas bordas, e limita contraste pra
//! evitar amplificar ruído.

use image::{Rgba, RgbaImage};

/// Histogram equalization global — aplica na luminância e
/// reconstrói RGB preservando matiz.
pub fn histogram_equalize(img: &RgbaImage) -> RgbaImage {
    let w = img.width();
    let h = img.height();
    let total = (w * h) as f32;

    // Histograma da luminância 0..255.
    let mut hist = [0u32; 256];
    for p in img.pixels() {
        let l = (0.299 * p.0[0] as f32 + 0.587 * p.0[1] as f32 + 0.114 * p.0[2] as f32) as usize;
        hist[l.min(255)] += 1;
    }

    // CDF acumulada → tabela de remap.
    let mut cdf = [0u32; 256];
    let mut acc = 0u32;
    for i in 0..256 {
        acc += hist[i];
        cdf[i] = acc;
    }
    let cdf_min = cdf.iter().copied().find(|&v| v > 0).unwrap_or(0) as f32;
    let mut lut = [0u8; 256];
    for i in 0..256 {
        let v = ((cdf[i] as f32 - cdf_min) / (total - cdf_min).max(1.0) * 255.0)
            .round()
            .clamp(0.0, 255.0) as u8;
        lut[i] = v;
    }

    // Remapeia luminância preservando matiz (multiplica RGB pela razão).
    let mut out = RgbaImage::new(w, h);
    for (x, y, p) in img.enumerate_pixels() {
        let l_old =
            0.299 * p.0[0] as f32 + 0.587 * p.0[1] as f32 + 0.114 * p.0[2] as f32;
        let l_new = lut[l_old.clamp(0.0, 255.0) as usize] as f32;
        let ratio = if l_old > 1.0 { l_new / l_old } else { 1.0 };
        let r = (p.0[0] as f32 * ratio).clamp(0.0, 255.0) as u8;
        let g = (p.0[1] as f32 * ratio).clamp(0.0, 255.0) as u8;
        let b = (p.0[2] as f32 * ratio).clamp(0.0, 255.0) as u8;
        out.put_pixel(x, y, Rgba([r, g, b, p.0[3]]));
    }
    out
}

/// CLAHE — divide em `tile_size` x `tile_size` tiles, equaliza cada um
/// com clip-limit, interpola bilinear nas bordas.
///
/// Implementação compacta: para cada tile computa LUT, depois remapeia
/// pixel por pixel usando os 4 tiles vizinhos com pesos bilineares.
pub fn clahe(img: &RgbaImage, tile_size: u32, clip_limit: f32) -> RgbaImage {
    let ts = tile_size.max(2);
    let cl = clip_limit.max(1.0);
    let w = img.width();
    let h = img.height();
    let tx_count = (w + ts - 1) / ts;
    let ty_count = (h + ts - 1) / ts;

    // Para cada tile, computa LUT da luminância equalizada com clip.
    let mut luts = vec![[0u8; 256]; (tx_count * ty_count) as usize];
    for ty in 0..ty_count {
        for tx in 0..tx_count {
            let x0 = tx * ts;
            let y0 = ty * ts;
            let x1 = (x0 + ts).min(w);
            let y1 = (y0 + ts).min(h);
            let tile_pixels = ((x1 - x0) * (y1 - y0)) as f32;
            if tile_pixels < 1.0 {
                continue;
            }

            // Histograma do tile.
            let mut hist = [0u32; 256];
            for y in y0..y1 {
                for x in x0..x1 {
                    let p = img.get_pixel(x, y);
                    let l = (0.299 * p.0[0] as f32
                        + 0.587 * p.0[1] as f32
                        + 0.114 * p.0[2] as f32) as usize;
                    hist[l.min(255)] += 1;
                }
            }

            // Clip: redistribui excesso uniformemente.
            let clip_count = (cl * tile_pixels / 256.0).max(1.0) as u32;
            let mut excess = 0u32;
            for h_val in hist.iter_mut() {
                if *h_val > clip_count {
                    excess += *h_val - clip_count;
                    *h_val = clip_count;
                }
            }
            let bonus = excess / 256;
            let remainder = excess % 256;
            for h_val in hist.iter_mut() {
                *h_val += bonus;
            }
            for i in 0..remainder as usize {
                hist[i] += 1;
            }

            // CDF → LUT.
            let mut acc = 0u32;
            let mut lut = [0u8; 256];
            for i in 0..256 {
                acc += hist[i];
                lut[i] =
                    ((acc as f32 / tile_pixels) * 255.0).clamp(0.0, 255.0) as u8;
            }
            luts[(ty * tx_count + tx) as usize] = lut;
        }
    }

    // Remap bilinear: para cada pixel, encontra os 4 tiles vizinhos e
    // pondera 4 LUTs pela posição.
    let mut out = RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let p = *img.get_pixel(x, y);
            let l_old = 0.299 * p.0[0] as f32
                + 0.587 * p.0[1] as f32
                + 0.114 * p.0[2] as f32;
            let li = l_old.clamp(0.0, 255.0) as usize;

            // Coordenada do pixel em "centros de tile".
            let fx = (x as f32 + 0.5) / ts as f32 - 0.5;
            let fy = (y as f32 + 0.5) / ts as f32 - 0.5;
            let tx0 = fx.floor().clamp(0.0, (tx_count - 1) as f32) as u32;
            let ty0 = fy.floor().clamp(0.0, (ty_count - 1) as f32) as u32;
            let tx1 = (tx0 + 1).min(tx_count - 1);
            let ty1 = (ty0 + 1).min(ty_count - 1);
            let dx = (fx - tx0 as f32).clamp(0.0, 1.0);
            let dy = (fy - ty0 as f32).clamp(0.0, 1.0);

            let v00 = luts[(ty0 * tx_count + tx0) as usize][li] as f32;
            let v10 = luts[(ty0 * tx_count + tx1) as usize][li] as f32;
            let v01 = luts[(ty1 * tx_count + tx0) as usize][li] as f32;
            let v11 = luts[(ty1 * tx_count + tx1) as usize][li] as f32;
            let v = (1.0 - dx) * (1.0 - dy) * v00
                + dx * (1.0 - dy) * v10
                + (1.0 - dx) * dy * v01
                + dx * dy * v11;

            let ratio = if l_old > 1.0 { v / l_old } else { 1.0 };
            out.put_pixel(
                x,
                y,
                Rgba([
                    (p.0[0] as f32 * ratio).clamp(0.0, 255.0) as u8,
                    (p.0[1] as f32 * ratio).clamp(0.0, 255.0) as u8,
                    (p.0[2] as f32 * ratio).clamp(0.0, 255.0) as u8,
                    p.0[3],
                ]),
            );
        }
    }
    out
}

/// Auto-levels — estica histograma por canal entre `pct_low` e `pct_high`
/// (percentiles em 0..100). 1 / 99 é o default.
pub fn auto_levels(img: &RgbaImage, pct_low: f32, pct_high: f32) -> RgbaImage {
    let pct_lo = pct_low.clamp(0.0, 49.0);
    let pct_hi = pct_high.clamp(pct_lo + 1.0, 100.0);
    let total = (img.width() * img.height()) as u32;
    let target_lo = (total as f32 * pct_lo / 100.0) as u32;
    let target_hi = (total as f32 * pct_hi / 100.0) as u32;

    // Compute per-channel low/high.
    let mut bounds = [(0u8, 255u8); 3];
    for ch in 0..3_usize {
        let mut hist = [0u32; 256];
        for p in img.pixels() {
            hist[p.0[ch] as usize] += 1;
        }
        let mut acc = 0u32;
        let mut lo = 0u8;
        let mut hi = 255u8;
        for i in 0..256 {
            acc += hist[i];
            if acc >= target_lo {
                lo = i as u8;
                break;
            }
        }
        acc = 0;
        for i in 0..256 {
            acc += hist[i];
            if acc >= target_hi {
                hi = i as u8;
                break;
            }
        }
        bounds[ch] = (lo, hi.max(lo + 1));
    }

    let mut out = RgbaImage::new(img.width(), img.height());
    for (x, y, p) in img.enumerate_pixels() {
        let mut o = [0u8; 4];
        for ch in 0..3 {
            let (lo, hi) = bounds[ch];
            let v = p.0[ch] as f32;
            let stretched =
                ((v - lo as f32) / (hi - lo).max(1) as f32) * 255.0;
            o[ch] = stretched.clamp(0.0, 255.0) as u8;
        }
        o[3] = p.0[3];
        out.put_pixel(x, y, Rgba(o));
    }
    out
}

/// Gray-world white balance — assume que a média da cena é cinza.
/// Multiplica cada canal pelo fator que iguala a média.
pub fn white_balance_gray_world(img: &RgbaImage) -> RgbaImage {
    let mut sum_r = 0u64;
    let mut sum_g = 0u64;
    let mut sum_b = 0u64;
    for p in img.pixels() {
        sum_r += p.0[0] as u64;
        sum_g += p.0[1] as u64;
        sum_b += p.0[2] as u64;
    }
    let n = (img.width() * img.height()) as f32;
    let mean_r = sum_r as f32 / n;
    let mean_g = sum_g as f32 / n;
    let mean_b = sum_b as f32 / n;
    let gray = (mean_r + mean_g + mean_b) / 3.0;
    let kr = if mean_r > 0.5 { gray / mean_r } else { 1.0 };
    let kg = if mean_g > 0.5 { gray / mean_g } else { 1.0 };
    let kb = if mean_b > 0.5 { gray / mean_b } else { 1.0 };

    let mut out = RgbaImage::new(img.width(), img.height());
    for (x, y, p) in img.enumerate_pixels() {
        out.put_pixel(
            x,
            y,
            Rgba([
                (p.0[0] as f32 * kr).clamp(0.0, 255.0) as u8,
                (p.0[1] as f32 * kg).clamp(0.0, 255.0) as u8,
                (p.0[2] as f32 * kb).clamp(0.0, 255.0) as u8,
                p.0[3],
            ]),
        );
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn histogram_equalize_stretches_dynamic_range() {
        // Imagem cinza em [50..100] — equalize deve expandir para ~[0..255].
        let mut img = RgbaImage::new(10, 10);
        for (i, p) in img.pixels_mut().enumerate() {
            let v = (50 + (i % 50)) as u8;
            *p = Rgba([v, v, v, 255]);
        }
        let out = histogram_equalize(&img);
        let mut max_v = 0u8;
        let mut min_v = 255u8;
        for p in out.pixels() {
            max_v = max_v.max(p.0[0]);
            min_v = min_v.min(p.0[0]);
        }
        assert!(max_v - min_v > 200, "dinâmica deveria expandir");
    }

    #[test]
    fn auto_levels_handles_constant_image() {
        // Imagem totalmente cinza → não pode dividir por zero.
        let img = RgbaImage::from_pixel(4, 4, Rgba([128, 128, 128, 255]));
        let out = auto_levels(&img, 1.0, 99.0);
        for p in out.pixels() {
            for ch in 0..3 {
                assert!(p.0[ch] <= 255);
            }
        }
    }

    #[test]
    fn white_balance_gray_world_neutralizes_colour_cast() {
        // Imagem inteira com cast vermelho.
        let img = RgbaImage::from_pixel(4, 4, Rgba([200, 100, 100, 255]));
        let out = white_balance_gray_world(&img);
        let p = out.get_pixel(0, 0).0;
        // Após gray-world, todos os canais ficam próximos.
        let max = p[0].max(p[1]).max(p[2]) as i32;
        let min = p[0].min(p[1]).min(p[2]) as i32;
        assert!(max - min < 15, "white balance deveria neutralizar");
    }

    #[test]
    fn clahe_small_image_does_not_panic() {
        let img = RgbaImage::from_pixel(4, 4, Rgba([100, 100, 100, 255]));
        let out = clahe(&img, 4, 2.0);
        assert_eq!(out.dimensions(), (4, 4));
    }
}
