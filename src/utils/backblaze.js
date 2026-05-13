const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

// ============================================================
// UPLOAD FILE TO NG API
// ============================================================
const uploadFileToNG = async ({ filePath, fileName, mimeType, docType }) => {
  try {
    console.log("========== UPLOADING TO NG API ==========");
    console.log("File :", fileName, filePath, mimeType, docType);

    const formData = new FormData();

    formData.append("app_id", process.env.APPID);
    formData.append("app_key", process.env.APPKEY);
    formData.append("bucket_id", process.env.BUCKETID);
    formData.append("company_name", process.env.COMPANYNAME);
    formData.append("doc_type", process.env.DOCTYPE);
    formData.append("flag", 1);

    formData.append("file", fs.createReadStream(filePath), {
      filename: fileName,
      contentType: mimeType,
    });

    const response = await axios.post(
      "https://microservices.dcctz.com/api/uploadFile/NG",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization:
            "Bearer EAAWOFw8QuSgBOZB6IYFbdSTpTBWD9pXeI5DEZB8ZCs8Ivtg7Fopi9llcc5hddMgUx65IiLe7cZCJevlWMV7JVkTbwm8qG7FMDh3PMoiGabhuufRtgRV32gy0Ttw0XeZAJcBj48gEywbPrQ3K6wxL0ZBabBfsVhGBcqVTxGWHJ1UZBUXPkKoMiJ1QbIHnBAu0pL1",
        },
      },
    );

    console.log("UPLOAD RESPONSE :", response.data);

    return response.data;
  } catch (error) {
    console.error("UPLOAD ERROR :", error.response?.data || error.message);

    return null;
  }
};

// ============================================================
// EXPORT
// ============================================================
module.exports = uploadFileToNG;
