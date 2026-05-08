const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const config = require("../../config/config");
const logger = require("../utils/logger");

class WhapiService {
  constructor() {
    this.client = axios.create({
      baseURL: config.whapi.apiUrl,
      headers: {
        Authorization: `Bearer ${config.whapi.token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        logger.error(
          `Whapi API Error: ${err.response?.status} - ${JSON.stringify(err.response?.data)}`,
        );
        throw err;
      },
    );
  }

  // ─── Sending Messages ────────────────────────────────────────────────

  async sendText(to, text, options = {}) {
    const res = await this.client.post("/messages/text", {
      to,
      body: text,
      ...options,
    });
    logger.info(`Text sent to ${to}`);
    return res.data;
  }
  async sendInteractive(data) {
    console.log("Sending interactive message with payload:", data);
    const res = await this.client.post("/messages/interactive", data);
    return res.data;
  }
  async sendImage(to, imageUrlOrPath, caption = "", isFile = false) {
    if (isFile) {
      const form = new FormData();
      form.append("to", to);
      form.append("caption", caption);
      form.append("media", fs.createReadStream(imageUrlOrPath));
      const res = await this.client.post("/messages/image", form, {
        headers: { ...form.getHeaders() },
      });
      return res.data;
    }
    const res = await this.client.post("/messages/image", {
      to,
      media: imageUrlOrPath,
      caption,
    });
    logger.info(`Image sent to ${to}`);
    return res.data;
  }

  async sendDocument(to, docUrl, filename, caption = "") {
    const res = await this.client.post("/messages/document", {
      to,
      media: docUrl,
      filename,
      caption,
    });
    logger.info(`Document sent to ${to}`);
    return res.data;
  }

  async sendAudio(to, audioUrl) {
    const res = await this.client.post("/messages/audio", {
      to,
      media: audioUrl,
    });
    return res.data;
  }

  async sendVideo(to, videoUrl, caption = "") {
    const res = await this.client.post("/messages/video", {
      to,
      media: videoUrl,
      caption,
    });
    return res.data;
  }

  async sendLocation(to, lat, lng, name = "", address = "") {
    const res = await this.client.post("/messages/location", {
      to,
      latitude: lat,
      longitude: lng,
      name,
      address,
    });
    logger.info(`Location sent to ${to}`);
    return res.data;
  }

  async sendContact(to, contactName, contactPhone) {
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL:${contactPhone}\nEND:VCARD`;
    const res = await this.client.post("/messages/contact", {
      to,
      name: contactName,
      vcard,
    });
    return res.data;
  }

  // ─── Interactive Messages ────────────────────────────────────────────

  // async sendButtons(to, body, buttons, header = "", footer = "") {
  //   const res = await this.client.post("/messages/interactive/buttons", {
  //     to,
  //     header: header ? { type: "text", text: header } : undefined,
  //     body: { text: body },
  //     footer: footer ? { text: footer } : undefined,
  //     action: {
  //       buttons: buttons.map((btn, i) => ({
  //         type: "reply",
  //         reply: { id: btn.id || `btn_${i}`, title: btn.title },
  //       })),
  //     },
  //   });
  //   logger.info(`Buttons sent to ${to}`);
  //   return res.data;
  // }

  // async sendList(to, body, buttonText, sections, header = "", footer = "") {
  //   const res = await this.client.post("/messages/interactive/list", {
  //     to,
  //     header: header ? { type: "text", text: header } : undefined,
  //     body: { text: body },
  //     footer: footer ? { text: footer } : undefined,
  //     action: {
  //       button: buttonText,
  //       sections,
  //     },
  //   });
  //   logger.info(`List sent to ${to}`);
  //   return res.data;
  // }

  async sendInteractive(payload) {
    const res = await this.client.post("/messages/interactive", payload);
    return res.data;
  }
  async sendList(to, body, buttonText, sections, header = "", footer = "") {
    return this.sendInteractive({
      to,
      type: "list",
      header: header ? { text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        list: {
          label: buttonText,
          sections,
        },
      },
    });
  }
  async sendButtons(to, body, buttons, header = "", footer = "") {
    return this.sendInteractive({
      to,
      type: "button",
      header: header ? { text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        buttons: buttons.map((btn) => ({
          type: "quick_reply",
          title: btn.title,
          id: btn.id,
        })),
      },
    });
  }

  async sendTemplate(to, templateName, languageCode = "en", components = []) {
    const res = await this.client.post("/messages/template", {
      to,
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
    return res.data;
  }

  // ─── Message Actions ─────────────────────────────────────────────────

  async replyToMessage(to, messageId, text) {
    const res = await this.client.post("/messages/text", {
      to,
      body: text,
      quoted_message_id: messageId,
    });
    return res.data;
  }

  async reactToMessage(messageId, chatId, emoji) {
    const res = await this.client.post("/messages/reaction", {
      message_id: messageId,
      chat_id: chatId,
      emoji,
    });
    return res.data;
  }

  async markAsRead(messageId) {
    const res = await this.client.put(`/messages/${messageId}/read`);
    return res.data;
  }

  async deleteMessage(messageId) {
    const res = await this.client.delete(`/messages/${messageId}`);
    return res.data;
  }

  // ─── Group Operations ────────────────────────────────────────────────

  async getGroups() {
    const res = await this.client.get("/groups");
    return res.data;
  }

  async getGroupInfo(groupId) {
    const res = await this.client.get(`/groups/${groupId}`);
    return res.data;
  }

  async addGroupParticipant(groupId, phone) {
    const res = await this.client.post(`/groups/${groupId}/participants`, {
      participants: [phone],
    });
    return res.data;
  }

  async removeGroupParticipant(groupId, phone) {
    const res = await this.client.delete(`/groups/${groupId}/participants`, {
      data: { participants: [phone] },
    });
    return res.data;
  }

  async promoteToAdmin(groupId, phone) {
    const res = await this.client.patch(
      `/groups/${groupId}/participants/promote`,
      { participants: [phone] },
    );
    return res.data;
  }

  // ─── Status / Presence ───────────────────────────────────────────────

  async sendTyping(chatId, duration = 3000) {
    await this.client.post("/chats/typing", { chat_id: chatId });
    return new Promise((res) => setTimeout(res, duration));
  }

  async setStatus(text) {
    const res = await this.client.post("/profile/about", { about: text });
    return res.data;
  }

  // ─── Profile ─────────────────────────────────────────────────────────

  async getProfile() {
    const res = await this.client.get("/profile");
    return res.data;
  }

  async setProfileName(name) {
    const res = await this.client.patch("/profile/name", { name });
    return res.data;
  }

  // ─── Webhook ─────────────────────────────────────────────────────────

  async setWebhook(url, events = ["messages"]) {
    const res = await this.client.post("/settings/webhooks", {
      url,
      events,
    });
    logger.info(`Webhook set to: ${url}`);
    return res.data;
  }

  async getWebhooks() {
    const res = await this.client.get("/settings/webhooks");
    return res.data;
  }

  // ─── Contacts ────────────────────────────────────────────────────────

  async checkPhone(phone) {
    const res = await this.client.post("/contacts/check", {
      contacts: [phone],
    });
    return res.data;
  }

  async getContact(phone) {
    const res = await this.client.get(`/contacts/${phone}`);
    return res.data;
  }

  // ─── Media ───────────────────────────────────────────────────────────

  async downloadMedia(mediaId) {
    const res = await this.client.get(`/media/${mediaId}`, {
      responseType: "arraybuffer",
    });
    return res.data;
  }
}

module.exports = new WhapiService();
