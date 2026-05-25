//! Pure-pixel operations applied during the export pipeline (MVP 7).
//!
//! Cada função aceita uma `RgbaImage` mutável (ou retorna nova) e
//! representa exatamente uma operação registrada no sidecar.
//!
//! Filosofia:
//!   - **Não destrutivo na sessão**: o `.sicroimage` lista os ajustes;
//!     o original em disco nunca é tocado.
//!   - **Destrutivo no derivado**: ao exportar, o pipeline aplica as
//!     operações em ordem e grava um arquivo novo em `imagens/exports/`.
//!   - **Pure-rust**: só `image` crate. Nada de OpenCV.

use image::{imageops, Rgba, RgbaImage};

use crate::models::{BackendAdjustments, BackendOperation};

// ---------------------------------------------------------------------------
// Visual adjustments

/// Apply all visual adjustments (brightness, contrast, gamma, saturation,
/// grayscale, invert) to an RGBA image in place. Order is deterministic:
/// gamma → brightness → contrast → saturation → grayscale → invert.
pub fn apply_adjustments(img: &mut RgbaImage, adj: &BackendAdjustments) {
    let gamma = if adj.gamma > 0.0 { adj.gamma } else { 1.0 };
    let brightness = adj.brightness.clamp(-100.0, 100.0) * 2.55; // ±255
    let contrast = (adj.contrast.clamp(-100.0, 100.0) + 100.0) / 100.0; // 0..2
    let saturation = (adj.saturation.clamp(-100.0, 100.0) + 100.0) / 100.0; // 0..2

    for pixel in img.pixels_mut() {
        let Rgba([r0, g0, b0, a]) = *pixel;

        // Convert to linear [0,1]
        let mut r = r0 as f32 / 255.0;
        let mut g = g0 as f32 / 255.0;
        let mut b = b0 as f32 / 255.0;

        // Gamma
        if (gamma - 1.0).abs() > 1e-4 {
            r = r.powf(1.0 / gamma);
            g = g.powf(1.0 / gamma);
            b = b.powf(1.0 / gamma);
        }

        // Brightness (additive in 0..255 space)
        let mut rr = (r * 255.0) + brightness;
        let mut gg = (g * 255.0) + brightness;
        let mut bb = (b * 255.0) + brightness;

        // Contrast around mid-gray 128.
        if (contrast - 1.0).abs() > 1e-4 {
            rr = ((rr - 128.0) * contrast) + 128.0;
            gg = ((gg - 128.0) * contrast) + 128.0;
            bb = ((bb - 128.0) * contrast) + 128.0;
        }

        // Saturation — mix with luminance.
        if (saturation - 1.0).abs() > 1e-4 {
            let lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
            rr = lum + (rr - lum) * saturation;
            gg = lum + (gg - lum) * saturation;
            bb = lum + (bb - lum) * saturation;
        }

        // Grayscale (replaces RGB with luminance).
        if adj.grayscale {
            let lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
            rr = lum;
            gg = lum;
            bb = lum;
        }

        // Invert (after grayscale so both compose).
        if adj.invert {
            rr = 255.0 - rr;
            gg = 255.0 - gg;
            bb = 255.0 - bb;
        }

        *pixel = Rgba([
            rr.clamp(0.0, 255.0) as u8,
            gg.clamp(0.0, 255.0) as u8,
            bb.clamp(0.0, 255.0) as u8,
            a,
        ]);
    }
}

// ---------------------------------------------------------------------------
// Geometric operations

/// Apply one geometric operation, returning a new image (some operations
/// can't be done in place because they change dimensions).
pub fn apply_operation(img: RgbaImage, op: &BackendOperation) -> RgbaImage {
    match op {
        BackendOperation::Rotate90Cw => imageops::rotate90(&img),
        BackendOperation::Rotate90Ccw => imageops::rotate270(&img),
        BackendOperation::Rotate180 => imageops::rotate180(&img),
        BackendOperation::FlipHorizontal => imageops::flip_horizontal(&img),
        BackendOperation::FlipVertical => imageops::flip_vertical(&img),
        BackendOperation::Crop {
            x,
            y,
            width,
            height,
        } => crop_safe(&img, *x, *y, *width, *height),
        BackendOperation::Resize { width, height } => imageops::resize(
            &img,
            (*width).max(1),
            (*height).max(1),
            imageops::FilterType::Lanczos3,
        ),
    }
}

fn crop_safe(img: &RgbaImage, x: u32, y: u32, w: u32, h: u32) -> RgbaImage {
    let iw = img.width();
    let ih = img.height();
    let x = x.min(iw.saturating_sub(1));
    let y = y.min(ih.saturating_sub(1));
    let w = w.min(iw - x).max(1);
    let h = h.min(ih - y).max(1);
    imageops::crop_imm(img, x, y, w, h).to_image()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_image() -> RgbaImage {
        // 2x2 mosaico: vermelho, verde, azul, branco.
        let mut img = RgbaImage::new(2, 2);
        img.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        img.put_pixel(1, 0, Rgba([0, 255, 0, 255]));
        img.put_pixel(0, 1, Rgba([0, 0, 255, 255]));
        img.put_pixel(1, 1, Rgba([255, 255, 255, 255]));
        img
    }

    #[test]
    fn invert_flips_channels() {
        let mut img = sample_image();
        apply_adjustments(
            &mut img,
            &BackendAdjustments {
                invert: true,
                ..Default::default()
            },
        );
        // Vermelho 255,0,0 → 0,255,255 (ciano).
        assert_eq!(img.get_pixel(0, 0).0[0], 0);
        assert_eq!(img.get_pixel(0, 0).0[1], 255);
        assert_eq!(img.get_pixel(0, 0).0[2], 255);
        // Branco → preto.
        let bw = img.get_pixel(1, 1).0;
        assert_eq!(bw[0], 0);
        assert_eq!(bw[1], 0);
        assert_eq!(bw[2], 0);
    }

    #[test]
    fn grayscale_equals_channels() {
        let mut img = sample_image();
        apply_adjustments(
            &mut img,
            &BackendAdjustments {
                grayscale: true,
                ..Default::default()
            },
        );
        for p in img.pixels() {
            assert_eq!(p.0[0], p.0[1]);
            assert_eq!(p.0[1], p.0[2]);
        }
    }

    #[test]
    fn brightness_positive_lifts_dark_pixels() {
        let mut img = RgbaImage::from_pixel(1, 1, Rgba([20, 20, 20, 255]));
        apply_adjustments(
            &mut img,
            &BackendAdjustments {
                brightness: 50.0,
                ..Default::default()
            },
        );
        let after = img.get_pixel(0, 0).0[0];
        assert!(after > 20, "brightness +50 deveria aumentar luminância");
    }

    #[test]
    fn rotate90cw_swaps_dimensions() {
        let img = sample_image();
        let rotated = apply_operation(img, &BackendOperation::Rotate90Cw);
        assert_eq!((rotated.width(), rotated.height()), (2, 2)); // quadrada
        // Pixel (0,0) original (vermelho) deve ir para (1,0) após 90° CW.
        assert_eq!(rotated.get_pixel(1, 0).0, [255, 0, 0, 255]);
    }

    #[test]
    fn flip_horizontal_mirrors_columns() {
        let img = sample_image();
        let flipped = apply_operation(img, &BackendOperation::FlipHorizontal);
        assert_eq!(flipped.get_pixel(0, 0).0, [0, 255, 0, 255]);
        assert_eq!(flipped.get_pixel(1, 0).0, [255, 0, 0, 255]);
    }

    #[test]
    fn crop_returns_subregion() {
        let img = sample_image();
        let cropped = apply_operation(
            img,
            &BackendOperation::Crop {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
        );
        assert_eq!((cropped.width(), cropped.height()), (1, 1));
        assert_eq!(cropped.get_pixel(0, 0).0, [255, 0, 0, 255]);
    }

    #[test]
    fn crop_clamps_oversize_request() {
        let img = sample_image();
        let cropped = apply_operation(
            img,
            &BackendOperation::Crop {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            },
        );
        // Não estoura: clamp ao tamanho real.
        assert_eq!((cropped.width(), cropped.height()), (2, 2));
    }

    #[test]
    fn resize_changes_dimensions() {
        let img = sample_image();
        let resized = apply_operation(
            img,
            &BackendOperation::Resize {
                width: 4,
                height: 4,
            },
        );
        assert_eq!((resized.width(), resized.height()), (4, 4));
    }
}
