/**
 * Client-side image resize utility.
 * Resizes images to a max dimension while preserving aspect ratio.
 * Returns a Blob ready for upload.
 */
export async function resizeImage(
  file: File,
  maxDimension: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only resize if larger than max dimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob, preserving original type if supported
      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const quality = outputType === "image/jpeg" ? 0.85 : undefined;

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Could not create image blob"));
          }
        },
        outputType,
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };

    img.src = url;
  });
}
