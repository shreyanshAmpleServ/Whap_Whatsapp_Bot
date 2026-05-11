const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { exec } = require("child_process");

// ===================================
// Save File
// ===================================
async function saveFile(input, filePath) {
  if (typeof input === "string" && input.startsWith("http")) {
    const res = await axios({
      url: input,
      method: "GET",
      responseType: "arraybuffer",
    });

    fs.writeFileSync(filePath, res.data);
    return;
  }

  if (Buffer.isBuffer(input)) {
    fs.writeFileSync(filePath, input);
    return;
  }

  throw new Error("Unsupported input");
}

// ===================================
// FAST IMAGE CLARITY CHECK
// ===================================
async function checkImageClarity(imagePath) {
  // Resize small for performance
  const image = sharp(imagePath).resize(500).greyscale();

  // Check dimensions
  const metadata = await image.metadata();

  if (metadata.width < 400 || metadata.height < 400) {
    return true; // blurry
  }

  // Laplacian edge detection
  const { data } = await image
    .convolve({
      width: 3,
      height: 3,
      kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }

  const mean = sum / data.length;

  const variance = sumSq / data.length - mean * mean;

  console.log("Variance:", variance);

  // Tune threshold
  return variance < 80;
}

// ===================================
// PDF CHECK
// ===================================
async function checkPdf(pdfPath, basePath) {
  await new Promise((resolve, reject) => {
    exec(
      `pdftoppm -jpeg -f 1 -singlefile "${pdfPath}" "${basePath}"`,
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });

  const imagePath = `${basePath}.jpg`;

  const blurry = await checkImageClarity(imagePath);

  cleanup([pdfPath, imagePath]);

  return blurry;
}

// ===================================
// MAIN
// ===================================
async function checkMediaBlur(mediaInput, mimeType) {
  const tempBase = path.join(__dirname, "../temp_" + Date.now());

  try {
    // ==========================
    // IMAGE
    // ==========================
    if (mimeType.startsWith("image/")) {
      const imgPath = tempBase + ".jpg";

      await saveFile(mediaInput, imgPath);

      const blurry = await checkImageClarity(imgPath);

      cleanup([imgPath]);

      return {
        isBlurry: blurry,
      };
    }

    // ==========================
    // PDF
    // ==========================
    if (mimeType === "application/pdf") {
      const pdfPath = tempBase + ".pdf";

      await saveFile(mediaInput, pdfPath);

      const blurry = await checkPdf(pdfPath, tempBase);

      return {
        isBlurry: blurry,
      };
    }

    return {
      isBlurry: false,
    };
  } catch (err) {
    console.error("Blur Error:", err.message);

    return {
      isBlurry: false,
    };
  }
}

// ===================================
// Cleanup
// ===================================
function cleanup(files) {
  for (const file of files) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

module.exports = {
  checkMediaBlur,
};

// const sharp = require("sharp");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const { exec } = require("child_process");
// const Tesseract = require("tesseract.js");
// const { franc } = require("franc");

// // ================================
// // Save input (URL / Buffer / Base64)
// // ================================
// async function saveFile(input, filePath) {
//   if (typeof input === "string" && input.startsWith("http")) {
//     const res = await axios({
//       url: input,
//       method: "GET",
//       responseType: "arraybuffer",
//     });
//     fs.writeFileSync(filePath, res.data);
//     return;
//   }

//   if (Buffer.isBuffer(input)) {
//     fs.writeFileSync(filePath, input);
//     return;
//   }

//   if (typeof input === "string") {
//     const base64Data = input.replace(/^data:.*;base64,/, "");
//     fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
//     return;
//   }

//   throw new Error("Unsupported media input");
// }

// // ================================
// // Blur detection (Laplacian)
// // ================================
// async function isBlurry(imagePath) {
//   const { data } = await sharp(imagePath)
//     .greyscale()
//     .convolve({
//       width: 3,
//       height: 3,
//       kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
//     })
//     .raw()
//     .toBuffer({ resolveWithObject: true });

//   let mean = 0;
//   let variance = 0;

//   for (let i = 0; i < data.length; i++) mean += data[i];
//   mean /= data.length;

//   for (let i = 0; i < data.length; i++) {
//     variance += Math.pow(data[i] - mean, 2);
//   }

//   variance /= data.length;

//   console.log("Laplacian variance:", variance);

//   return variance < 120;
// }

// // ================================
// // Detect Language
// // ================================

// function detectLanguage(text) {
//   if (!text || text.trim().length < 10) return "english";

//   const langCode = franc(text);

//   console.log("Detected code:", langCode);

//   const langMap = {
//     eng: "english",
//     hin: "hindi",
//     ara: "arabic",
//     arb: "arabic",
//     swa: "swahili",
//     fra: "french",
//     deu: "german",
//     spa: "spanish",
//     urd: "urdu",
//   };

//   return langMap[langCode] || "english";
// }
// // function detectLanguage(text) {
// //   let hindiCount = 0;
// //   let arabicCount = 0;
// //   let englishCount = 0;

// //   for (let char of text) {
// //     if (/[\u0900-\u097F]/.test(char)) hindiCount++;
// //     else if (/[\u0600-\u06FF]/.test(char)) arabicCount++;
// //     else if (/[a-zA-Z]/.test(char)) englishCount++;
// //   }

// //   console.log("Lang counts:", {
// //     hindiCount,
// //     arabicCount,
// //     englishCount,
// //   });

// //   // 🔥 Decide based on majority
// //   if (hindiCount > arabicCount && hindiCount > englishCount) return "hindi";
// //   if (arabicCount > hindiCount && arabicCount > englishCount) return "arabic";

// //   return "english";
// // }

// // ================================
// // OCR readability
// // ================================
// async function extractText(imagePath) {
//   const resizedPath = imagePath + "_resized.jpg";

//   await sharp(imagePath).resize(1200).toFile(resizedPath);

//   const result = await Tesseract.recognize(resizedPath, "eng+hin+ara+swa", {
//     logger: () => {},
//   });

//   fs.unlinkSync(resizedPath);

//   const confidence = result.data.confidence;
//   const text = result.data.text.trim();

//   console.log("OCR confidence:", confidence);
//   console.log("Text:", text.slice(0, 100));

//   return { text, confidence };
// }

// // ================================
// // Check readability
// // ================================
// function isReadable(text, confidence) {
//   if (!text || text.length === 0) return false;
//   if (confidence < 65) return false;
//   if (text.length < 20) return false;

//   const cleanText = text.replace(/[^a-zA-Z0-9\u0900-\u097F\u0600-\u06FF]/g, "");

//   if (cleanText.length < 15) return false;

//   return true;
// }

// // ================================
// // PDF → images → check
// // ================================
// async function checkPdf(pdfPath, basePath) {
//   await new Promise((resolve, reject) => {
//     exec(`pdftoppm -jpeg "${pdfPath}" "${basePath}"`, (err) =>
//       err ? reject(err) : resolve(),
//     );
//   });

//   const files = fs
//     .readdirSync(path.dirname(basePath))
//     .filter((f) => f.startsWith(path.basename(basePath)))
//     .map((f) => path.join(path.dirname(basePath), f));

//   const MAX_PAGES = 3;

//   for (let i = 0; i < files.length && i < MAX_PAGES; i++) {
//     const blurry = await isBlurry(files[i]);
//     if (blurry) {
//       cleanupFiles(pdfPath, files);
//       return { isBlurry: true, text: "", lang: "unknown" };
//     }

//     const { text, confidence } = await extractText(files[i]);
//     const readable = isReadable(text, confidence);

//     if (!readable) {
//       cleanupFiles(pdfPath, files);
//       return { isBlurry: true, text, lang: detectLanguage(text) };
//     }
//   }

//   cleanupFiles(pdfPath, files);
//   return { isBlurry: false, text: "", lang: "english" };
// }

// // ================================
// // MAIN FUNCTION
// // ================================
// async function checkMediaBlur(mediaInput, mimeType) {
//   const tempBase = path.join(__dirname, "../temp_" + Date.now());

//   try {
//     console.log("Is buffer:", Buffer.isBuffer(mediaInput));
//     console.log("Mime:", mimeType);

//     // ============================
//     // IMAGE
//     // ============================
//     if (mimeType.startsWith("image/")) {
//       const imgPath = tempBase + ".jpg";

//       await saveFile(mediaInput, imgPath);

//       const blurry = await isBlurry(imgPath);

//       if (blurry) {
//         fs.unlinkSync(imgPath);
//         return { isBlurry: true, text: "", lang: "unknown" };
//       }

//       const { text, confidence } = await extractText(imgPath);
//       fs.unlinkSync(imgPath);

//       // const readable = isReadable(text, confidence);
//       // const lang = detectLanguage(text);

//       // if (!readable) {
//       //   return { isBlurry: true, text, lang };
//       // }

//       return { isBlurry: false, text, lang };
//     }

//     // ============================
//     // PDF
//     // ============================
//     if (mimeType === "application/pdf") {
//       const pdfPath = tempBase + ".pdf";

//       await saveFile(mediaInput, pdfPath);

//       const result = await checkPdf(pdfPath, tempBase);

//       if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

//       return result;
//     }

//     return { isBlurry: false, text: "", lang: "english" };
//   } catch (err) {
//     console.error("Blur check error:", err.message);
//     return { isBlurry: false, text: "", lang: "english" };
//   }
// }

// // ================================
// // Cleanup
// // ================================
// function cleanupFiles(pdfPath, files) {
//   try {
//     if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
//     files.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
//   } catch (e) {
//     console.error("Cleanup error:", e.message);
//   }
// }

// module.exports = { checkMediaBlur };

//////////////////////////////////////////////////

// const sharp = require("sharp");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const { exec } = require("child_process");
// const Tesseract = require("tesseract.js");

// // ================================
// // Save input (URL / Buffer / Base64)
// // ================================
// async function saveFile(input, filePath) {
//   // URL
//   if (typeof input === "string" && input.startsWith("http")) {
//     const res = await axios({
//       url: input,
//       method: "GET",
//       responseType: "arraybuffer",
//     });
//     fs.writeFileSync(filePath, res.data);
//     return;
//   }

//   // ✅ Buffer (WhatsApp case)
//   if (Buffer.isBuffer(input)) {
//     fs.writeFileSync(filePath, input);
//     return;
//   }

//   // Base64
//   if (typeof input === "string") {
//     const base64Data = input.replace(/^data:.*;base64,/, "");
//     fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
//     return;
//   }

//   throw new Error("Unsupported media input type");
// }

// // ================================
// // Blur detection (Laplacian)
// // ================================
// async function isBlurry(imagePath) {
//   const { data } = await sharp(imagePath)
//     .greyscale()
//     .convolve({
//       width: 3,
//       height: 3,
//       kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
//     })
//     .raw()
//     .toBuffer({ resolveWithObject: true });

//   let mean = 0;
//   let variance = 0;

//   for (let i = 0; i < data.length; i++) mean += data[i];
//   mean /= data.length;

//   for (let i = 0; i < data.length; i++) {
//     variance += Math.pow(data[i] - mean, 2);
//   }

//   variance /= data.length;

//   console.log("Laplacian variance:", variance);

//   return variance < 150; // 🔥 tuned for real-world blur
// }

// // ================================
// // OCR readability check
// // ================================
// async function isReadable(imagePath) {
//   try {
//     // 🔥 resize for better OCR
//     const resizedPath = imagePath + "_resized.jpg";

//     await sharp(imagePath).resize(1200).toFile(resizedPath);

//     const result = await Tesseract.recognize(resizedPath, "eng", {
//       logger: () => {},
//     });

//     fs.unlinkSync(resizedPath);

//     const confidence = result.data.confidence;
//     const text = result.data.text.trim();

//     console.log("OCR confidence:", confidence);
//     console.log("Text length:", text.length);

//     if (!text || text.length === 0) return false;
//     if (confidence < 65) return false;
//     if (text.length < 20) return false;

//     const cleanText = text.replace(/[^a-zA-Z0-9]/g, "");
//     if (cleanText.length < 15) return false;

//     return true;
//   } catch (err) {
//     console.error("OCR error:", err.message);
//     return false;
//   }
// }

// // ================================
// // PDF → images → check
// // ================================
// async function checkPdf(pdfPath, basePath) {
//   await new Promise((resolve, reject) => {
//     const cmd = `pdftoppm -jpeg "${pdfPath}" "${basePath}"`;
//     exec(cmd, (err) => (err ? reject(err) : resolve()));
//   });

//   const files = fs
//     .readdirSync(path.dirname(basePath))
//     .filter((f) => f.startsWith(path.basename(basePath)))
//     .map((f) => path.join(path.dirname(basePath), f));

//   const MAX_PAGES = 3;

//   for (let i = 0; i < files.length && i < MAX_PAGES; i++) {
//     console.log(`Checking PDF Page ${i + 1}`);

//     const blurry = await isBlurry(files[i]);
//     if (blurry) {
//       cleanupFiles(pdfPath, files);
//       return true;
//     }

//     const readable = await isReadable(files[i]);
//     if (!readable) {
//       cleanupFiles(pdfPath, files);
//       return true;
//     }
//   }

//   cleanupFiles(pdfPath, files);
//   return false;
// }

// // ================================
// // MAIN FUNCTION (FINAL)
// // ================================
// async function checkMediaBlur(mediaInput, mimeType) {
//   const tempBase = path.join(__dirname, "../temp_" + Date.now());

//   try {
//     console.log("Is buffer:", Buffer.isBuffer(mediaInput));
//     console.log("Mime type:", mimeType);

//     // ============================
//     // IMAGE
//     // ============================
//     if (mimeType.startsWith("image/")) {
//       const imgPath = tempBase + ".jpg";

//       await saveFile(mediaInput, imgPath);

//       const blurry = await isBlurry(imgPath);
//       if (blurry) {
//         fs.unlinkSync(imgPath);
//         console.log("❌ Image blurry");
//         return true;
//       }

//       const readable = await isReadable(imgPath);
//       fs.unlinkSync(imgPath);

//       if (!readable) {
//         console.log("❌ Image not readable");
//         return true;
//       }

//       console.log("✅ Image OK");
//       return false;
//     }

//     // ============================
//     // PDF
//     // ============================
//     if (mimeType === "application/pdf") {
//       const pdfPath = tempBase + ".pdf";

//       await saveFile(mediaInput, pdfPath);

//       const result = await checkPdf(pdfPath, tempBase);

//       if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

//       return result;
//     }

//     console.log("Skipping file:", mimeType);
//     return false;
//   } catch (err) {
//     console.error("Blur check error:", err.message);
//     return false;
//   }
// }

// // ================================
// // Cleanup helper
// // ================================
// function cleanupFiles(pdfPath, files) {
//   try {
//     if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
//     files.forEach((f) => {
//       if (fs.existsSync(f)) fs.unlinkSync(f);
//     });
//   } catch (e) {
//     console.error("Cleanup error:", e.message);
//   }
// }

// module.exports = { checkMediaBlur };

/////////////////////////////////////////////////////////////

// const sharp = require("sharp");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const { exec } = require("child_process");

// // ================================
// // Download file
// // ================================
// async function downloadFile(url, filePath) {
//   const res = await axios({
//     url,
//     method: "GET",
//     responseType: "arraybuffer",
//   });

//   fs.writeFileSync(filePath, res.data);
// }

// // ================================
// // Blur detection (Sharp)
// // ================================
// // async function isBlurry(imagePath) {
// //   const { data } = await sharp(imagePath)
// //     .greyscale()
// //     .raw()
// //     .toBuffer({ resolveWithObject: true });

// //   let mean = 0;
// //   let variance = 0;

// //   for (let i = 0; i < data.length; i++) {
// //     mean += data[i];
// //   }

// //   mean /= data.length;

// //   for (let i = 0; i < data.length; i++) {
// //     variance += Math.pow(data[i] - mean, 2);
// //   }

// //   variance /= data.length;

// //   console.log("Sharp variance:", variance);

// //   return variance < 500; // 🔥 adjust if needed
// // }
// async function isBlurry(imagePath) {
//   const { data, info } = await sharp(imagePath)
//     .greyscale()
//     .convolve({
//       width: 3,
//       height: 3,
//       kernel: [0, -1, 0, -1, 4, -1, 0, -1, 0],
//     })
//     .raw()
//     .toBuffer({ resolveWithObject: true });

//   let mean = 0;
//   let variance = 0;

//   for (let i = 0; i < data.length; i++) {
//     mean += data[i];
//   }

//   mean /= data.length;

//   for (let i = 0; i < data.length; i++) {
//     variance += Math.pow(data[i] - mean, 2);
//   }

//   variance /= data.length;

//   console.log("Laplacian variance:", variance);

//   return variance < 50; // 🔥 tune this (20–100 range)
// }

// // ================================
// // Convert PDF → images
// // ================================
// async function checkPdfBlur(pdfPath, basePath) {
//   await new Promise((resolve, reject) => {
//     const cmd = `pdftoppm -jpeg "${pdfPath}" "${basePath}"`;
//     exec(cmd, (err) => (err ? reject(err) : resolve()));
//   });

//   const files = fs
//     .readdirSync(path.dirname(basePath))
//     .filter((f) => f.startsWith(path.basename(basePath)))
//     .map((f) => path.join(path.dirname(basePath), f));

//   const MAX_PAGES = 3;

//   for (let i = 0; i < files.length && i < MAX_PAGES; i++) {
//     const blurry = await isBlurry(files[i]);

//     console.log("PDF Page", i + 1, "blur:", blurry);

//     if (blurry) {
//       cleanupFiles(pdfPath, files);
//       return true;
//     }
//   }

//   cleanupFiles(pdfPath, files);
//   return false;
// }

// // ================================
// // MAIN FUNCTION
// // ================================
// async function checkMediaBlur(mediaUrl, mimeType) {
//   const tempBase = path.join(__dirname, "../temp_" + Date.now());

//   try {
//     // ============================
//     // IMAGE
//     // ============================
//     if (mimeType.startsWith("image/")) {
//       const imgPath = tempBase + ".jpg";

//       await downloadFile(mediaUrl, imgPath);

//       const result = await isBlurry(imgPath);

//       fs.unlinkSync(imgPath);

//       return result;
//     }

//     // ============================
//     // PDF
//     // ============================
//     if (mimeType === "application/pdf") {
//       const pdfPath = tempBase + ".pdf";

//       await downloadFile(mediaUrl, pdfPath);

//       const result = await checkPdfBlur(pdfPath, tempBase);

//       if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

//       return result;
//     }

//     // ============================
//     // OTHER DOCUMENTS (skip blur)
//     // ============================
//     console.log("Skipping blur check for:", mimeType);

//     return false;
//   } catch (err) {
//     console.error("Blur check error:", err.message);
//     return false; // fallback → allow
//   }
// }

// // ================================
// // Cleanup helper
// // ================================
// function cleanupFiles(pdfPath, files) {
//   try {
//     if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
//     files.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
//   } catch (e) {
//     console.error("Cleanup error:", e.message);
//   }
// }

// module.exports = { checkMediaBlur };

// const cv = require("opencv4nodejs");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");
// const { exec } = require("child_process");

// // ================================
// // Download file
// // ================================
// async function downloadFile(url, filePath) {
//   const res = await axios({
//     url,
//     method: "GET",
//     responseType: "arraybuffer",
//   });

//   fs.writeFileSync(filePath, res.data);
// }

// // ================================
// // Blur detection (OpenCV)
// // ================================
// function isBlurry(imagePath) {
//   const img = cv.imread(imagePath);
//   const gray = img.bgrToGray();

//   const laplacian = gray.laplacian(cv.CV_64F);
//   const variance = laplacian.mean().w;

//   console.log("Blur variance:", variance);

//   return variance < 80; // 🔥 adjust
// }

// // ================================
// // Convert PDF → image (first page)
// // ================================
// // function convertPdfToImage(pdfPath, outputPath) {
// //   return new Promise((resolve, reject) => {
// //     const cmd = `pdftoppm -jpeg -f 1 -singlefile "${pdfPath}" "${outputPath}"`;

// //     exec(cmd, (err) => {
// //       if (err) return reject(err);
// //       resolve(outputPath + ".jpg");
// //     });
// //   });
// // }
// function convertToPDF(inputPath, outputPath) {
//   return new Promise((resolve, reject) => {
//     const cmd = `soffice --headless --convert-to pdf "${inputPath}" --outdir "${path.dirname(outputPath)}"`;

//     exec(cmd, (err) => {
//       if (err) return reject(err);

//       const pdfPath = outputPath.replace(path.extname(outputPath), ".pdf");
//       resolve(pdfPath);
//     });
//   });
// }

// // ================================
// // MAIN FUNCTION
// // ================================
// // async function checkMediaBlur(mediaUrl, mimeType) {
// //   const tempBase = path.join(__dirname, "../temp_" + Date.now());

// //   try {
// //     // ============================
// //     // IMAGE
// //     // ============================
// //     if (mimeType.startsWith("image/")) {
// //       const imgPath = tempBase + ".jpg";

// //       await downloadFile(mediaUrl, imgPath);

// //       const result = isBlurry(imgPath);

// //       fs.unlinkSync(imgPath);

// //       return result;
// //     }

// //     // ============================
// //     // PDF
// //     // ============================
// //     if (mimeType === "application/pdf") {
// //       const pdfPath = tempBase + ".pdf";

// //       await downloadFile(mediaUrl, pdfPath);

// //       const imagePath = await convertPdfToImage(pdfPath, tempBase);

// //       const result = isBlurry(imagePath);

// //       fs.unlinkSync(pdfPath);
// //       fs.unlinkSync(imagePath);

// //       return result;
// //     }

// //     // ============================
// //     // OTHER DOCUMENT (try as image)
// //     // ============================
// //     const filePath = tempBase;

// //     await downloadFile(mediaUrl, filePath);

// //     const result = isBlurry(filePath);

// //     fs.unlinkSync(filePath);

// //     return result;
// //   } catch (err) {
// //     console.error("Blur check error:", err.message);
// //     return false; // fallback → allow
// //   }
// // }
// async function checkMediaBlur(mediaUrl, mimeType) {
//   const tempBase = path.join(__dirname, "../temp_" + Date.now());

//   try {
//     // ============================
//     // IMAGE
//     // ============================
//     if (mimeType.startsWith("image/")) {
//       const imgPath = tempBase + ".jpg";

//       await downloadFile(mediaUrl, imgPath);

//       const result = isBlurry(imgPath);
//       fs.unlinkSync(imgPath);

//       return result;
//     }

//     // ============================
//     // PDF
//     // ============================
//     if (mimeType === "application/pdf") {
//       return await checkPdfBlur(mediaUrl, tempBase);
//     }

//     // ============================
//     // CSV / Excel / Word → convert
//     // ============================
//     if (
//       mimeType.includes("csv") ||
//       mimeType.includes("excel") ||
//       mimeType.includes("spreadsheet") ||
//       mimeType.includes("word") ||
//       mimeType.includes("document")
//     ) {
//       const filePath = tempBase + getExtension(mimeType);

//       await downloadFile(mediaUrl, filePath);

//       // 🔥 Convert to PDF
//       const pdfPath = await convertToPDF(filePath, tempBase);

//       const result = await checkPdfBlur(pdfPath, tempBase);

//       cleanupFiles(filePath, [pdfPath]);

//       return result;
//     }

//     return false;
//   } catch (err) {
//     console.error("Blur check error:", err.message);
//     return false;
//   }
// }
// // async function checkMediaBlur(mediaUrl, mimeType) {
// //   const tempBase = path.join(__dirname, "../temp_" + Date.now());

// //   try {
// //     // ============================
// //     // IMAGE (direct)
// //     // ============================
// //     if (mimeType.startsWith("image/")) {
// //       const imgPath = tempBase + ".jpg";

// //       await downloadFile(mediaUrl, imgPath);

// //       const result = isBlurry(imgPath);

// //       fs.unlinkSync(imgPath);

// //       return result;
// //     }

// //     // ============================
// //     // PDF (multi-page)
// //     // ============================
// //     if (mimeType === "application/pdf") {
// //       const pdfPath = tempBase + ".pdf";

// //       await downloadFile(mediaUrl, pdfPath);

// //       // Convert ALL pages
// //       await new Promise((resolve, reject) => {
// //         const cmd = `pdftoppm -jpeg "${pdfPath}" "${tempBase}"`;
// //         exec(cmd, (err) => (err ? reject(err) : resolve()));
// //       });

// //       // Get generated images
// //       const files = fs
// //         .readdirSync(path.dirname(tempBase))
// //         .filter((f) => f.startsWith(path.basename(tempBase)))
// //         .map((f) => path.join(path.dirname(tempBase), f));

// //       const MAX_PAGES = 3; // 🔥 limit for performance

// //       for (let i = 0; i < files.length && i < MAX_PAGES; i++) {
// //         const blurry = isBlurry(files[i]);

// //         console.log("Page", i + 1, "blur:", blurry);

// //         if (blurry) {
// //           cleanupFiles(pdfPath, files);
// //           return true; // ❌ reject early
// //         }
// //       }

// //       cleanupFiles(pdfPath, files);
// //       return false; // ✅ all pages clear
// //     }

// //     // ============================
// //     // OTHER DOCUMENTS
// //     // ============================
// //     // Only process if it's actually an image-type doc
// //     if (
// //       mimeType.includes("jpeg") ||
// //       mimeType.includes("png") ||
// //       mimeType.includes("jpg")
// //     ) {
// //       const filePath = tempBase + ".jpg";

// //       await downloadFile(mediaUrl, filePath);

// //       const result = isBlurry(filePath);

// //       fs.unlinkSync(filePath);

// //       return result;
// //     }

// //     // ============================
// //     // UNSUPPORTED DOC TYPES
// //     // ============================
// //     console.log("Skipping blur check for:", mimeType);

// //     return false; // allow (no blur check)
// //   } catch (err) {
// //     console.error("Blur check error:", err.message);
// //     return false; // fallback → allow
// //   }
// // }

// // ================================
// // Cleanup helper
// // ================================
// function cleanupFiles(pdfPath, files) {
//   try {
//     if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
//     files.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
//   } catch (e) {
//     console.error("Cleanup error:", e.message);
//   }
// }
// function getExtension(mime) {
//   if (mime.includes("csv")) return ".csv";
//   if (mime.includes("excel")) return ".xlsx";
//   if (mime.includes("word")) return ".docx";
//   return ".tmp";
// }
// async function checkPdfBlur(pdfPath, basePath) {
//   await new Promise((resolve, reject) => {
//     const cmd = `pdftoppm -jpeg "${pdfPath}" "${basePath}"`;
//     exec(cmd, (err) => (err ? reject(err) : resolve()));
//   });

//   const files = fs
//     .readdirSync(path.dirname(basePath))
//     .filter((f) => f.startsWith(path.basename(basePath)))
//     .map((f) => path.join(path.dirname(basePath), f));

//   const MAX_PAGES = 3;

//   for (let i = 0; i < files.length && i < MAX_PAGES; i++) {
//     const blurry = isBlurry(files[i]);

//     if (blurry) {
//       cleanupFiles(pdfPath, files);
//       return true;
//     }
//   }

//   cleanupFiles(pdfPath, files);
//   return false;
// }

// module.exports = { checkMediaBlur };
