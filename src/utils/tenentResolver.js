const axios = require("axios");

async function resolveTenant(whatsappNumber) {
  try {
    console.log("whatsapp Number : ", whatsappNumber);
    const url = `https://logsuitedomainverify.dcctz.com/api/get_whapi_config?whapi_channel=${whatsappNumber}`;

    const response = await axios.get(url);

    const data = response.data;

    if (!data || !data.data) {
      return null;
    }

    return {
      whapiToken: data.data.whapi_token,

      databaseName: data.data.db_name,
    };
  } catch (error) {
    console.error("Tenant Resolve Error:", error.message);

    return null;
  }
}

module.exports = {
  resolveTenant,
};
