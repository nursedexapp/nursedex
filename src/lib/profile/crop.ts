/**
 * Client-side crop utility. Takes an image source plus the pixel crop area
 * produced by react-easy-crop and returns a Blob ready for upload, capped
 * to PHOTO_UPLOAD.MAX_DIMENSION_PX on the long edge. Mirrors resize.ts's
 * canvas + quality settings.
 */
import { PHOTO_UPLOAD } from "@/lib/constants";

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function getCroppedBlob(
  imageSrc: string,
  area: CropArea,
  fileType: string,
): Promise<Blob> {
  const img = await loadImage(imageSrc);

  // Output dimensions: the crop area, scaled down if it exceeds the cap.
  let outW = Math.round(area.width);
  let outH = Math.round(area.height);
  const max = PHOTO_UPLOAD.MAX_DIMENSION_PX;
  if (outW > max) {
    outH = Math.round((outH * max) / outW);
    outW = max;
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);

  const outputType = fileType === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputType === "image/jpeg" ? 0.85 : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not create image blob")),
      outputType,
      quality,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}
