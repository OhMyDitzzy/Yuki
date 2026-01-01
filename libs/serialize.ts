import type {
  UserFacingSocketConfig,
  MiscMessageGenerationOptions,
  MessageRelayOptions,
} from "baileys";
import _makeWASockets, {
  areJidsSameUser,
  downloadContentFromMessage,
  extractMessageContent,
  generateForwardMessageContent,
  generateMessageID,
  generateMessageIDV2,
  generateWAMessageFromContent,
  getDevice,
  isJidGroup,
  jidDecode,
  normalizeMessageContent,
  prepareWAMessageMedia,
  proto,
  WAMessageStubType,
} from "baileys";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs";
import PhoneNumber from "awesome-phonenumber";
import os from "os";
import util, { format } from "node:util";
import { fileTypeFromBuffer } from "file-type";
import { toAudio } from "./converter";
import { Jimp, JimpMime } from "jimp";
import type { ExtendedWASocket } from "../types/extendWASocket";
import type { ExtendedWAMessage } from "../types/extendWAMessage";
import { makeInMemoryStore } from "./makeInMemoryStore.ts";
import pino from "pino";

global.store = await makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })

// A code for button support from shannz, thanks to him
// repo: https://github.com/Shannzx10/KurumiSaki/
function buildInteractiveButtons(buttons: any[] = []) {
  return buttons.map((b, i) => {
    if (b && b.name && b.buttonParamsJson) return b;
    if (b && (b.id || b.text)) {
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: b.text || b.displayText || 'Button ' + (i + 1),
          id: b.id || ('quick_' + (i + 1))
        })
      };
    }
    if (b && b.buttonId && b.buttonText?.displayText) {
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: b.buttonText.displayText,
          id: b.buttonId
        })
      };
    }
    return b;
  });
}

function getButtonArgs(message: any) {
  const nativeFlow = message.interactiveMessage?.nativeFlowMessage;
  const firstButtonName = nativeFlow?.buttons?.[0]?.name;
  const nativeFlowSpecials = [
    'mpm', 'cta_catalog', 'send_location',
    'call_permission_request', 'wa_payment_transaction_details',
    'automated_greeting_message_view_catalog'
  ];

  if (nativeFlow && (firstButtonName === 'review_and_pay' || firstButtonName === 'payment_info')) {
    return {
      tag: 'biz',
      attrs: {
        native_flow_name: firstButtonName === 'review_and_pay' ? 'order_details' : firstButtonName
      }
    };
  } else if (nativeFlow && nativeFlowSpecials.includes(firstButtonName)) {
    return {
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'interactive',
        attrs: {
          type: 'native_flow',
          v: '1'
        },
        content: [{
          tag: 'native_flow',
          attrs: {
            v: '2',
            name: firstButtonName
          }
        }]
      }]
    };
  } else if (nativeFlow || message.buttonsMessage) {
    return {
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'interactive',
        attrs: {
          type: 'native_flow',
          v: '1'
        },
        content: [{
          tag: 'native_flow',
          attrs: {
            v: '9',
            name: 'mixed'
          }
        }]
      }]
    };
  } else if (message.listMessage) {
    return {
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'list',
        attrs: {
          v: '2',
          type: 'product_list'
        }
      }]
    };
  } else {
    return {
      tag: 'biz',
      attrs: {}
    };
  }
}

async function convertToInteractiveMessage(sock: any, content: any) {
  if (content.interactiveButtons && content.interactiveButtons.length > 0) {
    const interactiveMessage: any = {
      nativeFlowMessage: {
        buttons: content.interactiveButtons.map(btn => ({
          name: btn.name || 'quick_reply',
          buttonParamsJson: btn.buttonParamsJson
        }))
      }
    };

    if (content.image || content.video || content.document) {
      const mediaType = content.image ? 'image' : content.video ? 'video' : 'document';
      const mediaContent = content[mediaType];

      try {
        const prepared = await prepareWAMessageMedia(
          { [mediaType]: mediaContent } as any,
          { upload: sock.waUploadToServer }
        );

        if (mediaType === 'image' && prepared.imageMessage) {
          interactiveMessage.header = {
            hasMediaAttachment: true,
            imageMessage: prepared.imageMessage
          };
        } else if (mediaType === 'video' && prepared.videoMessage) {
          interactiveMessage.header = {
            hasMediaAttachment: true,
            videoMessage: prepared.videoMessage
          };
        } else if (mediaType === 'document' && prepared.documentMessage) {
          interactiveMessage.header = {
            hasMediaAttachment: true,
            documentMessage: prepared.documentMessage
          };
        }
      } catch (error) {
        console.error('Failed to prepare media:', error);
        throw error;
      }
    } else if (content.title || content.subtitle) {
      interactiveMessage.header = {
        title: content.title || content.subtitle || ''
      };
    }

    if (content.caption || content.text) {
      interactiveMessage.body = { text: content.caption || content.text };
    }
    if (content.footer) {
      interactiveMessage.footer = { text: content.footer };
    }

    const newContent = { ...content };
    delete newContent.interactiveButtons;
    delete newContent.title;
    delete newContent.subtitle;
    delete newContent.text;
    delete newContent.caption;
    delete newContent.footer;
    delete newContent.image;
    delete newContent.video;
    delete newContent.document;

    return { ...newContent, interactiveMessage };
  }
  return content;
}

export function makeWASocket(
  config: UserFacingSocketConfig,
  options: any = {},
): ExtendedWASocket {
  let conn: any = _makeWASockets(config);

  const originalUserDescriptor = Object.getOwnPropertyDescriptor(conn, 'user');
  const userState = {
    cleanLid: null as string | null
  };

  const sock = Object.defineProperties(conn, {
    chats: {
      value: { ...(options.chats || {}) },
      writable: true,
    },
    user: {
      get() {
        let originalUser;

        if (originalUserDescriptor?.get) {
          originalUser = originalUserDescriptor.get.call(conn);
        } else if (originalUserDescriptor?.value) {
          originalUser = originalUserDescriptor.value;
        } else {
          originalUser = conn._user || conn.__user;
        }

        if (!originalUser) return originalUser;

        return {
          ...originalUser,
          lid: userState.cleanLid || originalUser.lid?.replace(/:\d+@/g, '@') || originalUser.lid
        };
      },
      set(value) {
        if (originalUserDescriptor?.set) {
          originalUserDescriptor.set.call(conn, value);
        } else {
          conn._user = value;
        }
      },
      enumerable: true,
      configurable: true
    },
    _updateCleanLid: {
      async value() {
        let originalUser;
        if (originalUserDescriptor?.get) {
          originalUser = originalUserDescriptor.get.call(conn);
        } else if (originalUserDescriptor?.value) {
          originalUser = originalUserDescriptor.value;
        } else {
          originalUser = conn._user;
        }

        if (originalUser?.lid) {
          try {
            userState.cleanLid = await conn.getLid(originalUser.lid);
          } catch (error) {
            conn.logger?.error?.('Failed to update clean LID:', error);
            userState.cleanLid = originalUser.lid.replace(/:\d+@/g, '@');
          }
        }
      },
      enumerable: false
    },
    decodeJid: {
      value(jid: any) {
        if (!jid || typeof jid !== 'string') return (!nullish(jid) && jid) || null
        return jid.decodeJid()
      },
    },
    getJid: {
      async value(input: string) {
        if (!input) return null
        const cleanInput = input.replace(/:\d+@/g, '@')

        if (cleanInput.endsWith("@s.whatsapp.net")) {
          return cleanInput
        }

        if (cleanInput.endsWith("@lid")) {
          try {
            const pn = await conn.signalRepository.lidMapping.getPNForLID(cleanInput)
            if (!pn) throw new Error("Failed to convert LID to JID")

            return pn.replace(/:\d+@/g, '@')
          } catch (error) {
            console.error("Error converting LID to JID:", error)
            throw new Error("An error occurred while converting LID to JID")
          }
        }

        const cleanNumber = input.replace(/[^0-9]/g, '')
        if (cleanNumber) {
          return `${cleanNumber}@s.whatsapp.net`
        }

        throw new Error("Invalid input format for getJid")
      },
      enumerable: true
    },

    getLid: {
      async value(jid: string) {
        if (!jid) return null

        const cleanJid = jid.replace(/:\d+@/g, '@')

        if (cleanJid.endsWith("@lid")) {
          return cleanJid
        }

        try {
          const lid = await conn.signalRepository.lidMapping.getLIDForPN(cleanJid)
          if (!lid) throw new Error("An error occurred while converting jid to lid")

          return lid.replace(/:\d+@/g, '@')
        } catch (error) {
          console.error("Error converting JID to LID:", error)
          throw new Error("An error occurred while converting jid to lid")
        }
      },
      enumerable: true
    },
    logger: {
      get() {
        return {
          info(...args: any) {
            console.log(
              chalk.bold.bgRgb(51, 204, 51)(" INFO "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.cyan(format(...args)),
            );
          },
          error(...args: any) {
            console.log(
              chalk.bold.bgRgb(247, 38, 33)(" ERROR "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.rgb(255, 38, 0)(format(...args)),
            );
          },
          warn(...args: any) {
            console.log(
              chalk.bold.bgRgb(255, 153, 0)(" WARNING "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.redBright(format(...args)),
            );
          },
          trace(...args: any) {
            console.log(
              chalk.grey(" TRACE "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.white(format(...args)),
            );
          },
          debug(...args: any) {
            console.log(
              chalk.bold.bgRgb(66, 167, 245)(" DEBUG "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.white(format(...args)),
            );
          },
        };
      },
      enumerable: true,
    },
    getFile: {
      async value(PATH: any, saveToFile: boolean = false) {
        try {
          let res: any, filename: any;
          let data = Buffer.isBuffer(PATH)
            ? PATH
            : PATH instanceof ArrayBuffer
              ? Buffer.from(PATH)
              : /^data:.*?\/.*?;base64,/i.test(PATH)
                ? Buffer.from(PATH.split(",")[1], "base64")
                : /^https?:\/\//.test(PATH)
                  ? ((res = await fetch(PATH)),
                    Buffer.from(await res.arrayBuffer()))
                  : fs.existsSync(PATH)
                    ? ((filename = PATH), fs.readFileSync(PATH))
                    : typeof PATH === "string"
                      ? Buffer.from(PATH)
                      : Buffer.alloc(0);

          if (!Buffer.isBuffer(data))
            throw new TypeError("Result is not a buffer");

          const type = (await fileTypeFromBuffer(data)) || {
            mime: "application/octet-stream",
            ext: "bin",
          };

          if (data && saveToFile && !filename) {
            filename = path.join(
              __dirname,
              "../tmp/" + Date.now() + "." + type.ext,
            );
            await fs.promises.writeFile(filename, data);
          }

          return {
            res,
            filename,
            ...type,
            data,
            deleteFile() {
              return filename && fs.promises.unlink(filename);
            },
          };
        } catch (err: any) {
          console.error("Error in getFile:", err);
          throw new Error("Failed to process the file: " + err.message);
        }
      },
      enumerable: true,
    },
    waitEvent: {
      value(
        eventName: any,
        is = (_: any) => true,
        maxTries = 25,
        timeoutMs = 5000,
      ) {
        return new Promise((resolve, reject) => {
          let tries = 0;
          let timeout: any;

          const onEvent = (...args: [any]) => {
            tries++;
            if (is(...args)) {
              clearTimeout(timeout);
              conn.ev.off(eventName, onEvent);
              resolve(...args);
            } else if (tries >= maxTries) {
              clearTimeout(timeout);
              conn.ev.off(eventName, onEvent);
              reject(new Error(`Max tries reached for event: ${eventName}`));
            }
          };

          conn.ev.on(eventName, onEvent);

          timeout = setTimeout(() => {
            conn.ev.off(eventName, onEvent);
            reject(new Error(`Timeout reached for event: ${eventName}`));
          }, timeoutMs);
        });
      },
      enumerable: true,
    },
    sendFile: {
      async value(
        jid: string,
        path: string,
        filename: string = "",
        caption = "",
        quoted: MiscMessageGenerationOptions,
        ptt = false,
        options = {},
      ) {
        try {
          let type = await conn.getFile(path, true);
          let { res, data: file, filename: pathFile } = type;

          if ((res && res.status !== 200) || file.length <= 65536) {
            try {
              throw { json: JSON.parse(file.toString()) };
            } catch (e: any) {
              if (e.json) throw e.json;
            }
          }

          const getMimeType = function(mime: any, options: any) {
            if (/webp/.test(mime) || (options.asSticker && /image/.test(mime)))
              return "sticker";
            if (/image/.test(mime) || (options.asImage && /webp/.test(mime)))
              return "image";
            if (/video/.test(mime)) return "video";
            if (/audio/.test(mime)) return "audio";

            return "document";
          };
          let mtype = getMimeType(type.mime, options);
          let mimetype = (options as any).mimetype || type.mime;

          if (/audio/.test(type.mime)) {
            let convert = await toAudio(file, type.ext);
            file = convert.data;
            pathFile = convert.filename;
            mtype = "audio";
            mimetype = (options as any).mimetype || "audio/ogg; codecs=opus";
          }

          let message = {
            caption,
            ptt,
            [mtype]: file,
            mimetype,
            fileName:
              filename || (pathFile ? pathFile.split("/").pop() : undefined),
            ...options,
          };

          let opt = {
            filename,
            quoted,
            ptt,
            upload: conn.waUploadToServer,
            ...options,
          };
          let m = await conn.sendMessage(jid, message, opt);

          return m;
        } catch (err: any) {
          console.error("Failed to send file:", err);
          throw new Error("Failed to send media file: " + err.message);
        }
      },
      enumerable: true,
    },
    sendSticker: {
      async value(
        jid: string,
        path: string,
        quoted: MiscMessageGenerationOptions,
        exif: any = {},
      ) {
        const { data, mime } = await conn.getFile(path);
        if (!data || data.length === 0)
          throw new TypeError("File Tidak Ditemukan");
        const meta = {
          packName: (exif.packName ?? exif.packname ?? global.stickpack) || "",
          packPublish:
            (exif.packPublish ?? exif.packpublish ?? global.stickauth) || "",
        };
        const sticker = await (
          await import("./exif.ts")
        ).writeExif({ mimetype: mime, data }, meta);
        return conn.sendMessage(
          jid,
          { sticker },
          { quoted, upload: conn.waUploadToServer },
        );
      },
    },
    sendContact: {
      async value(
        jid: string,
        data: any,
        quoted: MiscMessageGenerationOptions,
        options = {},
      ) {
        try {
          if (!Array.isArray(data[0]) && typeof data[0] === "string")
            data = [data];

          let contacts: any = [];
          for (let [number, name] of data) {
            number = number.replace(/[^0-9]/g, "");
            if (!number) throw new Error("Invalid phone number provided.");

            let njid = number + "@s.whatsapp.net";

            let biz =
              (await conn.getBusinessProfile(njid).catch(() => null)) || {};
            let vname = conn.chats[njid]?.vname || conn.getName(njid) || name;
            let bizDescription = biz.description
              ? `\nX-WA-BIZ-NAME:${vname}\nX-WA-BIZ-DESCRIPTION:${biz.description.replace(/\n/g, "\\n")}`
              : "";

            let vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${name.replace(/\n/g, "\\n")}
TEL;type=CELL;type=VOICE;waid=${number}:${PhoneNumber("+" + number).getNumber("international")}${bizDescription}
END:VCARD`.trim();

            contacts.push({ vcard, displayName: name });
          }

          return await conn.sendMessage(
            jid,
            {
              ...options,
              contacts: {
                displayName:
                  (contacts.length > 1
                    ? `${contacts.length} contacts`
                    : (contacts[0] as any).displayName) || null,
                contacts,
              },
            },
            { quoted, ...options },
          );
        } catch (err: any) {
          console.error("Error in sendContact:", err);
          throw new Error("Failed to send contact: " + err.message);
        }
      },
      enumerable: true,
    },
    sendContactArray: {
      async value(
        jid: string,
        data: any,
        quoted: MiscMessageGenerationOptions,
        options = {},
      ) {
        try {
          let contacts: any = [];
          for (let [
            number,
            name,
            org,
            email,
            address,
            website,
            label2,
          ] of data) {
            number = number.replace(/[^0-9]/g, "");
            if (!number) throw new Error("Invalid phone number provided.");

            let njid = number + "@s.whatsapp.net";
            let biz =
              (await conn.getBusinessProfile(njid).catch(() => null)) || {};
            let vname = conn.chats[njid]?.vname || conn.getName(njid) || name;
            let bizDescription = biz.description
              ? `\nX-WA-BIZ-NAME:${vname}\nX-WA-BIZ-DESCRIPTION:${biz.description.replace(/\n/g, "\\n")}`
              : "";
            let vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${name.replace(/\n/g, "\\n")}
ORG:${org || ""}
TEL;type=CELL;type=VOICE;waid=${number}:${PhoneNumber("+" + number).getNumber("international")}
item1.EMAIL;type=INTERNET:${email || ""}
item1.X-ABLabel:📧 Email
item2.ADR:;;${address || ""};;;;
item2.X-ABADR:ac
item2.X-ABLabel:📍 Region
item3.URL:${website || ""}
item3.X-ABLabel:Website
item4.X-ABLabel:${label2 || ""}
${bizDescription}
END:VCARD`.trim();

            contacts.push({ vcard, displayName: name });
          }

          return await conn.sendMessage(
            jid,
            {
              ...options,
              contacts: {
                displayName:
                  (contacts.length > 1
                    ? `${contacts.length} contacts`
                    : (contacts[0] as any).displayName) || null,
                contacts,
              },
            },
            { quoted, ...options },
          );
        } catch (err: any) {
          console.error("Error in sendContactArray:", err);
          throw new Error("Failed to send contact array: " + err.message);
        }
      },
      enumerable: true,
    },
    resize: {
      async value(
        image: string | Buffer | ArrayBuffer,
        width: number,
        height: number,
      ) {
        let oyy = await Jimp.read(image);
        let kiyomasa = await oyy
          .resize({ w: width, h: height })
          .getBuffer(JimpMime.jpeg);
        return kiyomasa;
      },
    },
    sendInteractiveMessage: {
      async value(
        jid: string,
        content: any,
        options: any = {}
      ) {
        const relayMessage = conn.relayMessage;
        const genMsgId = generateMessageIDV2 || generateMessageID;
        if (!generateWAMessageFromContent || !normalizeMessageContent || !isJidGroup || !genMsgId || !relayMessage) {
          throw new Error('Missing baileys internals');
        }

        const convertedContent = await convertToInteractiveMessage(conn, content);

        const userJid = conn.authState?.creds?.me?.id || conn.user?.id || conn.user?.jid;
        const fullMsg = generateWAMessageFromContent(jid, convertedContent, {
          logger: conn.logger,
          userJid,
          messageId: genMsgId(userJid),
          timestamp: new Date(),
          ...options
        });

        const normalizedContent = normalizeMessageContent(fullMsg.message);
        const buttonArgs = getButtonArgs(normalizedContent);
        const isPrivate = !isJidGroup(jid);

        let additionalNodes = [...(options.additionalNodes || [])];
        additionalNodes.push(buttonArgs);

        if (isPrivate && options.useAI === true) {
          additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
        }

        await relayMessage(jid, fullMsg.message, {
          messageId: fullMsg.key.id,
          useCachedGroupMetadata: options.useCachedGroupMetadata,
          additionalAttributes: options.additionalAttributes || {},
          statusJidList: options.statusJidList,
          additionalNodes
        });

        const isPrivateChat = !isJidGroup(jid);
        if (conn.config?.emitOwnEvents && isPrivateChat) {
          process.nextTick(() => {
            if (conn.processingMutex?.mutex && conn.upsertMessage) {
              conn.processingMutex.mutex(() => conn.upsertMessage(fullMsg, 'append'));
            }
          });
        }

        return fullMsg;
      }
    },

    sendButton: {
      async value(
        jid: string,
        text: string,
        buttons: any[] = [],
        quoted?: any,
        options: any = {}
      ) {
        const {
          caption = '',
          footer = '',
          title,
          subtitle,
          image,
          video,
          document
        } = options;

        const interactiveButtons = buildInteractiveButtons(buttons);
        const payload: any = {
          text: text || caption,
          caption: caption || text,
          footer,
          interactiveButtons
        };

        if (title) payload.title = title;
        if (subtitle) payload.subtitle = subtitle;
        if (image) payload.image = image;
        if (video) payload.video = video;
        if (document) payload.document = document;

        const sendOptions: any = { ...options };
        if (quoted && quoted.key) {
          sendOptions.quoted = quoted;
        }

        return conn.sendInteractiveMessage(jid, payload, sendOptions);
      }
    },
    sendButtonV2: {
      async value(jid: string, btnOpts: any, buttons: any[], quoted: any) {
        try {
          let interactiveBtn = buttons.map((button: any) => {
            if (button.type === "url") {
              return {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: button.text,
                  url: button.url,
                  merchant_url: button.url
                })
              }
            } else if (button.type === 'copy') {
              return {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: button.text,
                  id: button.id,
                  copy_code: button.copy_code
                })
              }
            } else if (button.type === 'buttons') {
              return {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: button.text,
                  id: button.id
                })
              };
            } else if (button.type === "reminder") {
              return {
                name: "cta_reminder",
                buttonParamsJson: JSON.stringify({
                  display_text: button.text,
                  id: button.id
                })
              }
            } else if (button.type === "webview") {
              return {
                name: "open_webview",
                buttonParamsJson: JSON.stringify({
                  link: {
                    in_app_webview: true,
                    display_text: button.text,
                    url: button.url,
                    success_url: button.url + "/success",
                    cancel_url: button.url + "/cancel"
                  }
                })
              }
            }
          });

          let msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  ...(btnOpts.contextInfo && {
                    contextInfo: btnOpts.contextInfo
                  }),
                  ...(btnOpts.header && {
                    header: proto.Message.InteractiveMessage.Header.create(btnOpts.header)
                  }),
                  ...(btnOpts.body && {
                    body: proto.Message.InteractiveMessage.Body.create(btnOpts.body)
                  }),
                  ...(btnOpts.footer && {
                    footer: proto.Message.InteractiveMessage.Footer.create(btnOpts.footer)
                  }),
                  nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: interactiveBtn as any
                  })
                })
              }
            }
          }, quoted)

          await conn!!.relayMessage(jid, msg.message, {
            messageId: msg.key.id,
          })
        } catch (e) {
          console.error(`Error sending button message: ${e}`)
        }
      }
    },
    sendButtonWithImage: {
      async value(
        jid: string,
        image: any,
        caption: string,
        buttons: any[],
        quoted?: any,
        options: any = {}
      ) {
        return conn.sendButton(jid, caption, buttons, quoted, {
          ...options,
          image
        });
      }
    },
    sendButtonWithVideo: {
      async value(
        jid: string,
        video: any,
        caption: string,
        buttons: any[],
        quoted?: any,
        options: any = {}
      ) {
        return conn.sendButton(jid, caption, buttons, quoted, {
          ...options,
          video
        });
      }
    },
    sendCarousel: {
      async value(
        jid: string,
        bodyOpts: any,
        cards: any[],
        quoted: any,
      ) {
        try {
          let preparedCards = await Promise.all(cards.map(async (card) => {
            let imageMedia;
            if (card.image) {
              if (Buffer.isBuffer(card.image)) {
                imageMedia = await prepareWAMessageMedia(
                  { image: card.image },
                  { upload: conn!!.waUploadToServer }
                );
              } else if (typeof card.image === 'string') {
                imageMedia = await prepareWAMessageMedia(
                  { image: { url: card.image } },
                  { upload: conn!!.waUploadToServer }
                );
              }
            }

            let cardButtons = card.buttons ? card.buttons.map((button: any) => {
              if (button.type === "url") {
                return {
                  name: "cta_url",
                  buttonParamsJson: JSON.stringify({
                    display_text: button.text,
                    url: button.url,
                    merchant_url: button.url
                  })
                };
              } else if (button.type === 'copy') {
                return {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: button.text,
                    id: button.id,
                    copy_code: button.copy_code
                  })
                };
              } else if (button.type === 'buttons') {
                return {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: button.text,
                    id: button.id
                  })
                };
              } else if (button.type === "reminder") {
                return {
                  name: "cta_reminder",
                  buttonParamsJson: JSON.stringify({
                    display_text: button.text,
                    id: button.id
                  })
                };
              } else if (button.type === "webview") {
                return {
                  name: "open_webview",
                  buttonParamsJson: JSON.stringify({
                    link: {
                      in_app_webview: true,
                      display_text: button.text,
                      url: button.url,
                      success_url: button.url + "/success",
                      cancel_url: button.url + "/cancel"
                    }
                  })
                };
              }
            }) : [];

            return {
              ...(card.header && imageMedia && {
                header: proto.Message.InteractiveMessage.Header.create({
                  title: card.header,
                  hasMediaAttachment: true,
                  ...imageMedia
                })
              }),
              ...(card.body && {
                body: proto.Message.InteractiveMessage.Body.create({
                  text: card.body
                })
              }),
              ...(card.footer && {
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: card.footer
                })
              }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: cardButtons as any
              })
            };
          }));

          let msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  ...(bodyOpts.contextInfo && {
                    contextInfo: bodyOpts.contextInfo
                  }),
                  ...(bodyOpts.header && {
                    header: proto.Message.InteractiveMessage.Header.create(bodyOpts.header)
                  }),
                  ...(bodyOpts.body && {
                    body: proto.Message.InteractiveMessage.Body.create(bodyOpts.body)
                  }),
                  ...(bodyOpts.footer && {
                    footer: proto.Message.InteractiveMessage.Footer.create(bodyOpts.footer)
                  }),
                  carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
                    cards: preparedCards
                  })
                })
              }
            }
          }, quoted);

          await conn!!.relayMessage(jid, msg.message, {
            messageId: msg.key.id
          });
        } catch (e: any) {
          console.error('Error sending carousel:', e);
        }
      }
    },
    sendListV2: {
      async value(
        jid: string,
        btnOpts: any,
        buttons: any,
        quoted: any
      ) {
        try {
          let msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  ...(btnOpts.contextInfo && {
                    contextInfo: btnOpts.contextInfo
                  }),
                  ...(btnOpts.header && {
                    header: proto.Message.InteractiveMessage.Header.create(btnOpts.header)
                  }),
                  ...(btnOpts.body && {
                    body: proto.Message.InteractiveMessage.Body.create(btnOpts.body)
                  }),
                  ...(btnOpts.footer && {
                    footer: proto.Message.InteractiveMessage.Footer.create(btnOpts.footer)
                  }),
                  nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: [{
                      name: "single_select",
                      buttonParamsJson: JSON.stringify(buttons)
                    }]
                  })
                })
              }
            }
          }, quoted)

          await conn!!.relayMessage(jid, msg.message, {
            messageId: msg.key.id
          })
        } catch (e) {
          console.error(e)
        }
      }
    },
    sendList: {
      async value(
        jid: string,
        text: string,
        buttonText: string,
        sections: any[],
        quoted?: any,
        options: any = {}
      ) {
        const { footer = '', title } = options;

        const listMessage = proto.Message.ListMessage.create({
          title: title || text,
          description: text,
          buttonText: buttonText || 'Click Here',
          footerText: footer,
          listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
          sections: sections.map(section => ({
            title: section.title || 'Section',
            rows: section.rows.map((row: any) => ({
              title: row.title || '',
              description: row.description || '',
              rowId: row.rowId || row.id || ''
            }))
          }))
        });

        const userJid = conn.user?.jid || conn.user?.id;

        const msgOptions: any = { userJid };
        if (quoted && quoted.key) {
          msgOptions.quoted = quoted;
        }

        const msg = generateWAMessageFromContent(jid, {
          listMessage
        }, msgOptions);

        const normalizedContent = normalizeMessageContent(msg.message);
        const buttonArgs = getButtonArgs(normalizedContent);

        await conn.relayMessage(jid, msg.message, {
          messageId: msg.key.id,
          additionalNodes: [buttonArgs]
        });

        return msg;
      }
    },
    reply: {
      value(
        jid: string,
        text = "",
        quoted: MiscMessageGenerationOptions,
        options: any,
      ) {
        let cleanText = typeof text === "string" ? text.replace(/@lid/g, "") : text;
        return Buffer.isBuffer(text)
          ? conn.sendFile(jid, text, "file", "", quoted, false, options)
          : conn.sendMessage(
            jid,
            {
              ...options,
              text: cleanText,
              contextInfo: {
                mentionedJid: conn.parseMention(text),
                ...(global.adReply?.contextInfo || {}),
              },
              ...options,
            },
            {
              quoted,
              ephemeralExpiration: global.ephemeral,
              ...options,
            },
          );
      },
    },
    sendMedia: {
      async value(
        jid: string,
        path: string,
        quoted: MiscMessageGenerationOptions,
        options = {},
      ) {
        try {
          let type = await conn.getFile(path, true);
          let { mime, data: file } = type;

          if (!mime) throw new Error("File type could not be determined.");
          // let messageType = mime.split('/')[0];
          let getMediaType = function(mime: any, options: any) {
            if (options.asDocument) return "document";
            if (/image/.test(mime)) return "image";
            if (/video/.test(mime)) return "video";
            if (/audio/.test(mime)) return "audio";
            return null;
          };

          let mediaType = getMediaType(mime, options);
          if (!mediaType) throw new Error("Unsupported media type.");

          let message = {
            [mediaType]: file,
            mimetype: mime,
            fileName: (options as any).fileName || path.split("/").pop(),
            ...options,
          };

          return await conn.sendMessage(jid, message, { quoted });
        } catch (err: any) {
          console.error("Error in sendMedia:", err);
          throw new Error("Failed to send media: " + err.message);
        }
      },
      enumerable: true,
    },
    updateProfileStatus: {
      async value(status: string) {
        return await conn.query({
          tag: "iq",
          attrs: {
            to: "s.whatsapp.net",
            type: "set",
            xmlns: "status",
          },
          content: [
            {
              tag: "status",
              attrs: {},
              content: Buffer.from(status, "utf-8"),
            },
          ],
        });
      },
    },

    sendPayment: {
      async value(
        jid: string,
        amount: number,
        currency: string,
        text = "",
        from: string,
        image: any,
        options: MessageRelayOptions,
      ) {
        let file = await conn.resize(image, 300, 150);
        let a = [
          "AED",
          "AFN",
          "ALL",
          "AMD",
          "ANG",
          "AOA",
          "ARS",
          "AUD",
          "AWG",
          "AZN",
          "BAM",
          "BBD",
          "BDT",
          "BGN",
          "BHD",
          "BIF",
          "BMD",
          "BND",
          "BOB",
          "BOV",
          "BRL",
          "BSD",
          "BTN",
          "BWP",
          "BYR",
          "BZD",
          "CAD",
          "CDF",
          "CHE",
          "CHF",
          "CHW",
          "CLF",
          "CLP",
          "CNY",
          "COP",
          "COU",
          "CRC",
          "CUC",
          "CUP",
          "CVE",
          "CZK",
          "DJF",
          "DKK",
          "DOP",
          "DZD",
          "EGP",
          "ERN",
          "ETB",
          "EUR",
          "FJD",
          "FKP",
          "GBP",
          "GEL",
          "GHS",
          "GIP",
          "GMD",
          "GNF",
          "GTQ",
          "GYD",
          "HKD",
          "HNL",
          "HRK",
          "HTG",
          "HUF",
          "IDR",
          "ILS",
          "INR",
          "IQD",
          "IRR",
          "ISK",
          "JMD",
          "JOD",
          "JPY",
          "KES",
          "KGS",
          "KHR",
          "KMF",
          "KPW",
          "KRW",
          "KWD",
          "KYD",
          "KZT",
          "LAK",
          "LBP",
          "LKR",
          "LRD",
          "LSL",
          "LTL",
          "LVL",
          "LYD",
          "MAD",
          "MDL",
          "MGA",
          "MKD",
          "MMK",
          "MNT",
          "MOP",
          "MRO",
          "MUR",
          "MVR",
          "MWK",
          "MXN",
          "MXV",
          "MYR",
          "MZN",
          "NAD",
          "NGN",
          "NIO",
          "NOK",
          "NPR",
          "NZD",
          "OMR",
          "PAB",
          "PEN",
          "PGK",
          "PHP",
          "PKR",
          "PLN",
          "PYG",
          "QAR",
          "RON",
          "RSD",
          "RUB",
          "RWF",
          "SAR",
          "SBD",
          "SCR",
          "SDG",
          "SEK",
          "SGD",
          "SHP",
          "SLL",
          "SOS",
          "SRD",
          "SSP",
          "STD",
          "SYP",
          "SZL",
          "THB",
          "TJS",
          "TMT",
          "TND",
          "TOP",
          "TRY",
          "TTD",
          "TWD",
          "TZS",
          "UAH",
          "UGX",
          "USD",
          "USN",
          "USS",
          "UYI",
          "UYU",
          "UZS",
          "VEF",
          "VND",
          "VUV",
          "WST",
          "XAF",
          "XAG",
          "XAU",
          "XBA",
          "XBB",
          "XBC",
          "XBD",
          "XCD",
          "XDR",
          "XFU",
          "XOF",
          "XPD",
          "XPF",
          "XPT",
          "XTS",
          "XXX",
          "YER",
          "ZAR",
          "ZMW",
        ];
        let b = a[Math.floor(Math.random() * a.length)];
        const requestPaymentMessage = {
          amount: {
            currencyCode: currency || b,
            offset: 0,
            value: amount || 9.99,
          },
          expiryTimestamp: 0,
          amount1000: (amount || 9.99) * 1000,
          currencyCodeIso4217: currency || b,
          requestFrom: from || "0@s.whatsapp.net",
          noteMessage: {
            extendedTextMessage: {
              text: text || "Example Payment Message",
            },
          },
          background: !!image ? file : undefined,
        };
        return await conn.relayMessage(
          jid,
          { requestPaymentMessage },
          { ...options },
        );
      },
    },
    sendPoll: {
      async value(
        jid: string,
        name = "",
        optiPoll: any,
        options: any = {},
      ) {
        if (!Array.isArray(optiPoll[0]) && typeof optiPoll[0] === "string")
          optiPoll = [optiPoll];

        const pollId = options.pollId || `poll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const pollMessage = {
          name: name,
          values: optiPoll.map((btn: any) => (!nullish(btn[0]) && btn[0]) || ""),
          multiselect: options.multiselect || false,
          selectableCount: options.selectableCount || 1,
        };

        const sentMsg = await conn.sendMessage(jid, { poll: pollMessage }, options);

        if (!global.pollMappings) global.pollMappings = {};

        const msgKey = sentMsg.key.id;
        global.pollMappings[msgKey] = {
          pollId,
          options: optiPoll.map((btn: any, index: number) => ({
            id: Array.isArray(btn) && btn[1] ? btn[1] : `option_${index}`,
            name: (!nullish(btn[0]) && btn[0]) || "",
            index
          }))
        };

        return sentMsg;
      },
    },

    downloadAndSaveMediaMessage: {
      async value(message: any, filename: any, attachExtension = true) {
        try {
          let quoted = message.msg || message;
          let mime = (message.msg || message).mimetype || "";
          let messageType = mime.split("/")[0];

          if (!["image", "video", "audio", "document"].includes(messageType)) {
            throw new Error("Message does not contain downloadable media.");
          }

          const dlType = messageType === "sticker" ? "image" : messageType;
          let stream: any;
          try {
            stream = await downloadContentFromMessage(quoted, dlType);
          } catch (e: any) {
            if (
              /readableStream/i.test(String(e?.message)) &&
              /PassThrough/i.test(String(e?.message))
            ) {
              const nodeStream: any = await import("node:stream");
              const origFromWeb = nodeStream.Readable.fromWeb?.bind(
                nodeStream.Readable,
              );
              if (origFromWeb) {
                try {
                  nodeStream.Readable.fromWeb = function(rs: any, opts: any) {
                    if (rs && typeof rs.getReader !== "function") return rs;
                    return origFromWeb(rs, opts);
                  };
                  stream = await downloadContentFromMessage(quoted, dlType);
                } finally {
                  nodeStream.Readable.fromWeb = origFromWeb;
                }
              } else {
                throw e;
              }
            } else {
              throw e;
            }
          }

          const toBuffer = async (s: any) => {
            if (s && typeof s.getReader === "function") {
              const reader = s.getReader();
              const chunks: any = [];
              for (; ;) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) chunks.push(Buffer.from(value));
              }
              return Buffer.concat(chunks);
            }

            if (s && typeof s[Symbol.asyncIterator] === "function") {
              const chunks: Buffer[] = [];
              for await (const chunk of s) {
                chunks.push(Buffer.from(chunk));
              }
              return Buffer.concat(chunks);
            }
            throw new Error(
              "Unsupported stream type from downloadContentFromMessage",
            );
          };

          const buffer = await toBuffer(stream);

          let fileType = await fileTypeFromBuffer(buffer);
          if (!fileType) {
            fileType = { ext: "bin", mime: "application/octet-stream" };
          }

          const trueFileName = attachExtension
            ? `${filename}.${fileType.ext}`
            : filename;
          await fs.promises.writeFile(trueFileName, buffer);

          return trueFileName;
        } catch (err: any) {
          console.error("Error downloading and saving media message:", err);
          throw new Error(
            "Failed to download and save media message: " + err.message,
          );
        }
      },
      enumerable: true,
    },
    msToDate: {
      async value(ms: number) {
        let days = Math.floor(ms / (24 * 60 * 60 * 1000));
        let daysms = ms % (24 * 60 * 60 * 1000);
        let hours = Math.floor(daysms / (60 * 60 * 1000));
        let hoursms = ms % (60 * 60 * 1000);
        let minutes = Math.floor(hoursms / (60 * 1000));
        // let minutesms = ms % (60 * 1000);
        // let sec = Math.floor((minutesms) / (1000));
        return days + " Hari " + hours + " Jam " + minutes + " Menit";
      },
    },
    delay: {
      async value(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      },
    },

    cMod: {
      value(
        jid: string,
        message: any,
        text = "",
        sender = conn.user.jid,
        options: any = {},
      ) {
        if (options.mentions && !Array.isArray(options.mentions))
          options.mentions = [options.mentions];
        let copy = message.toJSON();
        delete copy.message.messageContextInfo;
        delete copy.message.senderKeyDistributionMessage;
        let mtype = Object.keys(copy.message)[0];
        let msg = copy.message;
        let content = msg[mtype!!];
        if (typeof content === "string") msg[mtype!!] = text || content;
        else if (content.caption) content.caption = text || content.caption;
        else if (content.text) content.text = text || content.text;
        if (typeof content !== "string") {
          msg[mtype!!] = { ...content, ...options };
          msg[mtype!!].contextInfo = {
            ...(content.contextInfo || {}),
            mentionedJid:
              options.mentions || content.contextInfo?.mentionedJid || [],
          };
        }
        if (copy.participant)
          sender = copy.participant = sender || copy.participant;
        else if (copy.key.participant)
          sender = copy.key.participant = sender || copy.key.participant;
        if (copy.key.remoteJid.includes("@s.whatsapp.net"))
          sender = sender || copy.key.remoteJid;
        else if (copy.key.remoteJid.includes("@broadcast"))
          sender = sender || copy.key.remoteJid;
        copy.key.remoteJid = jid;
        copy.key.fromMe = areJidsSameUser(sender, conn.user.id) || false;
        return proto.WebMessageInfo.create(copy);
      },
      enumerable: true,
    },
    copyNForward: {
      async value(
        jid: string,
        message: any,
        forwardingScore = true,
        options: any = {},
      ) {
        let vtype: any;
        if (options.readViewOnce && message.message.viewOnceMessage?.message) {
          vtype = Object.keys(message.message.viewOnceMessage.message)[0];
          delete message.message.viewOnceMessage.message[vtype].viewOnce;
          message.message = proto.Message.create(
            JSON.parse(JSON.stringify(message.message.viewOnceMessage.message)),
          );
          message.message[vtype].contextInfo =
            message.message.viewOnceMessage.contextInfo;
        }
        let mtype = Object.keys(message.message)[0];
        let m: any = generateForwardMessageContent(message, !!forwardingScore);
        let ctype = Object.keys(m)[0];
        if (
          forwardingScore &&
          typeof forwardingScore === "number" &&
          forwardingScore > 1
        )
          m[ctype!!].contextInfo.forwardingScore += forwardingScore;
        m[ctype!!].contextInfo = {
          ...(message.message[mtype!!].contextInfo || {}),
          ...(m[ctype!!].contextInfo || {}),
        };
        m = generateWAMessageFromContent(jid, m, {
          ...options,
          userJid: conn.user.jid,
        });
        await conn.relayMessage(jid, m.message, {
          messageId: m.key.id,
          additionalAttributes: { ...options },
        });
        return m;
      },
      enumerable: true,
    },

    fakeReply: {
      value(
        jid: string,
        text = "",
        fakeJid = conn.user.jid,
        fakeText = "",
        fakeGroupJid: any,
        options: MiscMessageGenerationOptions,
      ) {
        return conn.reply(jid, text, {
          key: {
            fromMe: areJidsSameUser(fakeJid, conn.user.id),
            participant: fakeJid,
            ...(fakeGroupJid ? { remoteJid: fakeGroupJid } : {}),
          },
          message: { conversation: fakeText },
          ...options,
        });
      },
    },
    downloadM: {
      async value(m: any, type: any, saveToFile: any) {
        try {
          if (!m || !(m.url || m.directPath)) {
            throw new Error("Invalid message or media not found.");
          }

          const dlType = type === "sticker" ? "image" : type;
          let stream: any;
          try {
            stream = await downloadContentFromMessage(m, dlType);
          } catch (e: any) {
            if (
              /readableStream/i.test(String(e?.message)) &&
              /PassThrough/i.test(String(e?.message))
            ) {
              const nodeStream: any = await import("node:stream");
              const origFromWeb = nodeStream.Readable.fromWeb?.bind(
                nodeStream.Readable,
              );
              if (origFromWeb) {
                try {
                  nodeStream.Readable.fromWeb = function(rs: any, opts: any) {
                    if (rs && typeof rs.getReader !== "function") return rs;
                    return origFromWeb(rs, opts);
                  };
                  stream = await downloadContentFromMessage(m, dlType);
                } finally {
                  nodeStream.Readable.fromWeb = origFromWeb;
                }
              } else {
                throw e;
              }
            } else {
              throw e;
            }
          }

          const toBuffer = async (s: any) => {
            if (s && typeof s.getReader === "function") {
              const reader = s.getReader();
              const chunks: Buffer[] = [];
              for (; ;) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) chunks.push(Buffer.from(value));
              }
              return Buffer.concat(chunks);
            }

            if (s && typeof s[Symbol.asyncIterator] === "function") {
              const chunks: Buffer[] = [];
              for await (const chunk of s) {
                chunks.push(Buffer.from(chunk));
              }
              return Buffer.concat(chunks);
            }
            throw new Error(
              "Unsupported stream type from downloadContentFromMessage",
            );
          };

          const buffer = await toBuffer(stream);

          if (saveToFile) {
            const fileType = await fileTypeFromBuffer(buffer);
            const filename =
              saveToFile || `downloaded_media.${fileType?.ext || "bin"}`;
            await fs.promises.writeFile(filename, buffer);
            return filename;
          }

          return buffer;
        } catch (err: any) {
          console.error("Error downloading media message:", err);
          throw new Error("Failed to download media: " + err.message);
        }
      },
      enumerable: true,
    },

    parseMention: {
      value(text = "") {
        /*const regex = /@([0-9]{5,16}|0)/g;
        const mentions: any = [];
        let match: any;

        while ((match = regex.exec(text)) !== null) {
          mentions.push(match[1] + "@s.whatsapp.net");
        }

        return mentions;*/
        if (!text) return [];

        const mentions: string[] = [];
        // Pattern for LID: @224786408058912@lid or 224786408058912@lid
        // LIDs can vary in length (usually 12-20 digits)
        const regexLid = /@?([0-9]{10,25}@lid)/g;
        const regexJid = /@([0-9]{5,16})(?!@lid)/g;

        let match: any;

        while ((match = regexLid.exec(text)) !== null) {
          mentions.push(match[1]);
        }

        const lidNumbers = mentions.map(lid => lid.replace(/@lid$/, ''));

        while ((match = regexJid.exec(text)) !== null) {
          const numberId = match[1];

          if (lidNumbers.includes(numberId)) continue;

          mentions.push(numberId + "@s.whatsapp.net");
        }

        return mentions
      },
      enumerable: true,
    },

    saveName: {
      async value(id: string, name = "") {
        if (!id) return;
        id = conn.decodeJid(id);
        let isGroup = id.endsWith("@g.us");
        if (
          id in conn.contacts &&
          conn.contacts[id][isGroup ? "subject" : "name"] &&
          id in conn.chats
        )
          return;
        let metadata: any = {};
        if (isGroup) metadata = await conn.groupMetadata(id);
        let chat = {
          ...(conn.contacts[id] || {}),
          id,
          ...(isGroup
            ? { subject: metadata.subject, desc: metadata.desc }
            : { name }),
        };
        conn.contacts[id] = chat;
        conn.chats[id] = chat;
      },
    },

    getName: {
      async value(jid = "", withoutContact = false) {
        jid = await conn.decodeJid(jid);
        withoutContact = conn.withoutContact || withoutContact;
        let v: any;
        if (jid.endsWith("@g.us"))
          return new Promise(async (resolve) => {
            v = conn.chats[jid] || {};
            if (!(v.name || v.subject))
              v = (await conn.groupMetadata(jid)) || {};
            resolve(
              v.name ||
              v.subject ||
              PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber(
                "international",
              ),
            );
          });
        else
          v =
            jid === "0@s.whatsapp.net"
              ? {
                jid,
                vname: "WhatsApp",
              }
              : areJidsSameUser(jid, conn.user.id)
                ? conn.user
                : conn.chats[jid] || {};
        return (
          (withoutContact ? "" : v.name) ||
          v.subject ||
          v.vname ||
          v.notify ||
          v.verifiedName ||
          PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber(
            "international",
          )
        );
      },
      enumerable: true,
    },

    loadMessage: {
      value(messageID: any) {
        return (Object as any)
          .entries(conn.chats)
          .filter(([_, { messages }]: any) => typeof messages === "object")
          .find(([_, { messages }]: any) =>
            Object.entries(messages).find(
              ([k, v]: any) => k === messageID || v.key?.id === messageID,
            ),
          )?.[1].messages?.[messageID];
      },
      enumerable: true,
    },

    sendGroupV4Invite: {
      async value(
        groupJid: string,
        participant: string,
        inviteCode: any,
        inviteExpiration: any,
        groupName = "unknown subject",
        caption = "Invitation to join my WhatsApp group",
        jpegThumbnail: any,
        options = {},
      ) {
        const msg = generateWAMessageFromContent(
          participant,
          {
            groupInviteMessage: {
              inviteCode,
              inviteExpiration:
                parseInt(inviteExpiration) ||
                new Date(new Date().getTime() + 3 * 86400000).getTime(),
              groupJid,
              groupName,
              jpegThumbnail,
              caption,
            },
          },
          {
            userJid: conn.user.id,
            ...options,
          },
        );
        await conn.relayMessage(participant, msg.message, {
          messageId: msg.key.id,
        });
        return msg;
      },
      enumerable: true,
    },
    processMessageStubType: {
      async value(m: any) {
        if (!m.messageStubType) return;
        const chat = await conn.decodeJid(
          m.key.remoteJid ||
          m.message?.senderKeyDistributionMessage?.groupId ||
          "",
        );
        if (!chat || chat === "status@broadcast") return;
        const emitGroupUpdate = (update: any) => {
          conn.ev.emit("groups.update", [{ id: chat, ...update }]);
        };
        switch (m.messageStubType) {
          case WAMessageStubType.REVOKE:
          case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
            emitGroupUpdate({ revoke: m.messageStubParameters[0] });
            break;
          case WAMessageStubType.GROUP_CHANGE_ICON:
            emitGroupUpdate({ icon: m.messageStubParameters[0] });
            break;
          default: {
            console.log({
              messageStubType: m.messageStubType,
              messageStubParameters: m.messageStubParameters,
              type: WAMessageStubType[m.messageStubType],
            });
            break;
          }
        }
        const isGroup = chat.endsWith("@g.us");
        if (!isGroup) return;
        let chats = conn.chats[chat];
        if (!chats) chats = conn.chats[chat] = { id: chat };
        chats.isChats = true;
        const metadata = await conn.groupMetadata(chat).catch(() => null);
        if (!metadata) return;
        chats.subject = metadata.subject;
        chats.metadata = metadata;
      },
    },
    insertAllGroup: {
      async value() {
        const groups = await conn.groupFetchAllParticipating().catch(() => null) || {}
        for (const group in groups) conn.chats[group] = { ...(conn.chats[group] || {}), id: group, subject: groups[group].subject, isChats: true, metadata: groups[group] }
        return conn.chats
      },
    },
    pushMessage: {
      async value(m: any) {
        if (!m) return;
        if (!Array.isArray(m)) m = [m];
        for (const message of m) {
          try {
            if (!message) continue;
            if (
              message.messageStubType &&
              message.messageStubType != WAMessageStubType.CIPHERTEXT
            )
              conn.processMessageStubType(message).catch(console.error);
            const _mtype = Object.keys(message.message || {});
            const mtype =
              (!["senderKeyDistributionMessage", "messageContextInfo"].includes(
                _mtype[0]!!,
              ) &&
                _mtype[0]) ||
              (_mtype.length >= 3 &&
                _mtype[1] !== "messageContextInfo" &&
                _mtype[1]) ||
              _mtype[_mtype.length - 1];
            const chat = await conn.decodeJid(
              message.key.remoteJid ||
              message.message?.senderKeyDistributionMessage?.groupId ||
              "",
            );
            if (message.message?.[mtype!!]?.contextInfo?.quotedMessage) {
              let context: any = message.message[mtype!!].contextInfo;
              let participant = await conn.decodeJid(context.participant);
              const remoteJid = await conn.decodeJid(
                context.remoteJid || participant,
              );

              let quoted: any =
                message.message[mtype!!].contextInfo.quotedMessage;
              if (remoteJid && remoteJid !== "status@broadcast" && quoted) {
                let qMtype = Object.keys(quoted)[0];
                if (qMtype == "conversation") {
                  quoted.extendedTextMessage = { text: quoted[qMtype] };
                  delete quoted.conversation;
                  qMtype = "extendedTextMessage";
                }
                if (!quoted[qMtype!!].contextInfo)
                  quoted[qMtype!!].contextInfo = {};
                quoted[qMtype!!].contextInfo.mentionedJid =
                  context.mentionedJid ||
                  quoted[qMtype!!].contextInfo.mentionedJid ||
                  [];
                const isGroup = remoteJid.endsWith("g.us");
                if (isGroup && !participant) participant = remoteJid;
                const qM = {
                  key: {
                    remoteJid,
                    fromMe: areJidsSameUser(conn.user.jid, remoteJid),
                    id: context.stanzaId,
                    participant,
                  },
                  message: JSON.parse(JSON.stringify(quoted)),
                  ...(isGroup ? { participant } : {}),
                };
                let qChats = conn.chats[participant];
                if (!qChats)
                  qChats = conn.chats[participant] = {
                    id: participant,
                    isChats: !isGroup,
                  };
                if (!qChats.messages) qChats.messages = {};
                if (!qChats.messages[context.stanzaId] && !qM.key.fromMe)
                  qChats.messages[context.stanzaId] = qM;
                let qChatsMessages: any;
                if (
                  (qChatsMessages = Object.entries(qChats.messages)).length > 40
                )
                  qChats.messages = Object.fromEntries(
                    qChatsMessages.slice(30, qChatsMessages.length),
                  );
              }
            }
            if (!chat || chat === "status@broadcast") continue;
            const isGroup = chat.endsWith("@g.us");
            let chats = conn.chats[chat];
            if (!chats) {
              if (isGroup) await conn.insertAllGroup().catch(console.error);
              chats = conn.chats[chat] = {
                id: chat,
                isChats: true,
                ...(conn.chats[chat] || {}),
              };
            }
            let metadata: any, sender: any;
            if (isGroup) {
              if (!chats.subject || !chats.metadata) {
                metadata =
                  (await conn.groupMetadata(chat).catch(() => ({}))) || {};
                if (!chats.subject) chats.subject = metadata.subject || "";
                if (!chats.metadata) chats.metadata = metadata;
              }
              sender = await conn.decodeJid(
                (message.key?.fromMe && conn.user.id) ||
                message.participant ||
                message.key?.participant ||
                chat ||
                "",
              );
              if (sender !== chat) {
                let chats = conn.chats[sender];
                if (!chats) chats = conn.chats[sender] = { id: sender };
                if (!chats.name)
                  chats.name = message.pushName || chats.name || "";
              }
            } else if (!chats.name)
              chats.name = message.pushName || chats.name || "";
            if (
              ["senderKeyDistributionMessage", "messageContextInfo"].includes(
                mtype!!,
              )
            )
              continue;
            chats.isChats = true;
            if (!chats.messages) chats.messages = {};
            const fromMe =
              message.key.fromMe ||
              areJidsSameUser(sender || chat, conn.user.id);
            if (
              !["protocolMessage"].includes(mtype!!) &&
              !fromMe &&
              message.messageStubType != WAMessageStubType.CIPHERTEXT &&
              message.message
            ) {
              delete message.message.messageContextInfo;
              delete message.message.senderKeyDistributionMessage;
              chats.messages[message.key.id] = JSON.parse(
                JSON.stringify(message, null, 2),
              );
              let chatsMessages: any;
              if ((chatsMessages = Object.entries(chats.messages)).length > 40)
                chats.messages = Object.fromEntries(
                  chatsMessages.slice(30, chatsMessages.length),
                );
            }
          } catch (e) {
            console.error(e);
          }
        }
      },
    },

    ...(typeof conn.chatRead !== "function"
      ? {
        chatRead: {
          value(jid: string, participant = conn.user.jid, messageID: any) {
            return conn.sendReadReceipt(jid, participant, [messageID]);
          },
          enumerable: true,
        },
      }
      : {}),
    ...(typeof conn.setStatus !== "function"
      ? {
        setStatus: {
          value(status: any) {
            return conn.query({
              tag: "iq",
              attrs: {
                to: "s.whatsapp.net",
                type: "set",
                xmlns: "status",
              },
              content: [
                {
                  tag: "status",
                  attrs: {},
                  content: Buffer.from(status, "utf-8"),
                },
              ],
            });
          },
          enumerable: true,
        },
      }
      : {}),
  });

  store.bind(conn.ev)

  if (sock.user?.id) sock.user.jid = sock.decodeJid(sock.user.id);
  if (conn.user?.lid) {
    conn._updateCleanLid();
  }
  return sock as ExtendedWASocket;
}

export function smsg(conn: ExtendedWASocket, m: any): ExtendedWAMessage {
  if (!m) return m;
  let M = proto.WebMessageInfo;
  m = M.create(m);
  Object.defineProperty(m, "conn", {
    enumerable: false,
    writable: true,
    value: conn,
  });
  let protocolMessageKey: any;
  if (m.message) {
    if (m.mtype == "protocolMessage" && m.msg.key) {
      protocolMessageKey = m.msg.key;
      if (protocolMessageKey == "status@broadcast")
        protocolMessageKey.remoteJid = m.chat;
      if (
        !protocolMessageKey.participant ||
        protocolMessageKey.participant == "status_me"
      )
        protocolMessageKey.participant = m.sender;
      protocolMessageKey.fromMe =
        conn.decodeJid(protocolMessageKey.participant) ===
        conn.decodeJid(conn.user!.id);
      if (
        !protocolMessageKey.fromMe &&
        protocolMessageKey.remoteJid === conn.decodeJid(conn.user!.id)
      )
        protocolMessageKey.remoteJid = m.sender;
    }
    if (m.quoted) if (!m.quoted.mediaMessage) delete m.quoted.download;
  }
  if (!m.mediaMessage) delete m.download;
  try {
    if (protocolMessageKey && m.mtype == "protocolMessage")
      conn.ev.emit("messages.delete", protocolMessageKey);
  } catch (e) {
    console.error(e);
  }
  return m as ExtendedWAMessage;
}

export function serialize() {
  const MediaType = [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "stickerMessage",
    "documentMessage",
  ];
  return Object.defineProperties(proto.WebMessageInfo.prototype, {
    conn: {
      value: undefined,
      enumerable: false,
      writable: true,
    },
    id: {
      get() {
        return this.key?.id;
      },
    },
    isBaileys: {
      get() {
        return (
          this.id?.length === 16 ||
          (this.id?.startsWith("3EB0") && this.id?.length === 22) ||
          false
        );
      },
    },
    chat: {
      get() {
        const senderKeyDistributionMessage =
          this.message?.senderKeyDistributionMessage?.groupId;
        return (
          this.key?.remoteJid ||
          (senderKeyDistributionMessage &&
            senderKeyDistributionMessage !== "status@broadcast") ||
          ""
        ).decodeJid();
      },
    },
    isGroup: {
      get() {
        return this.chat.endsWith("@g.us") ? true : false;
      },
      enumerable: true,
    },
    sender: {
      get() {
        if (this.key?.fromMe) return (this.conn?.user?.lid || '').decodeJid()
        const raw = (this.key.participant || this.chat || '');
        // there is no point to search jid again
        // its time to migrate to LID
        return String(raw).decodeJid();
      },
      enumerable: true
    },
    fromMe: {
      get() {
        return (
          this.key?.fromMe ||
          areJidsSameUser(this.conn?.user.id, this.sender) ||
          false
        );
      },
    },
    mtype: {
      get() {
        if (!this.message) return "";
        const type = Object.keys(this.message);
        return (
          (!["senderKeyDistributionMessage", "messageContextInfo"].includes(
            type[0] as string,
          ) &&
            type[0]) ||
          (type.length >= 3 && type[1] !== "messageContextInfo" && type[1]) ||
          type[type.length - 1]
        );
      },
      enumerable: true,
    },
    msg: {
      get() {
        if (!this.message) return null;
        return this.message[this.mtype];
      },
    },
    mediaMessage: {
      get() {
        if (!this.message) return null;
        const Message =
          (this.msg?.url || this.msg?.directPath
            ? {
              ...this.message,
            }
            : extractMessageContent(this.message)) || null;
        if (!Message) return null;
        const mtype = Object.keys(Message)[0];
        return MediaType.includes(mtype!!) ? Message : null;
      },
      enumerable: true,
    },
    messages: {
      get() {
        return this.message ? this.message : null;
      },
      enumerable: true,
    },
    mediaType: {
      get() {
        let message: any;
        if (!(message = this.mediaMessage)) return null;
        return Object.keys(message)[0];
      },
      enumerable: true,
    },
    quoted: {
      get() {
        const self = this;
        const msg = self.msg;
        const contextInfo = msg?.contextInfo;
        const quoted = contextInfo?.quotedMessage;
        const conns = this.conn;
        if (!msg || !contextInfo || !quoted) return null;
        const type = Object.keys(quoted)[0];
        let q = quoted[type!!];
        const text = typeof q === "string" ? q : q.text;
        return Object.defineProperties(
          JSON.parse(
            JSON.stringify(
              typeof q === "string"
                ? {
                  text: q,
                }
                : q,
            ),
          ),
          {
            mtype: {
              get() {
                return type;
              },
              enumerable: true,
            },
            mediaMessage: {
              get() {
                const Message =
                  (q.url || q.directPath
                    ? {
                      ...quoted,
                    }
                    : extractMessageContent(quoted)) || null;
                if (!Message) return null;
                const mtype = Object.keys(Message)[0];
                return MediaType.includes(mtype!!) ? Message : null;
              },
              enumerable: true,
            },
            messages: {
              get() {
                return quoted ? quoted : null;
              },
              enumerable: true,
            },
            mediaType: {
              get() {
                let message: any;
                if (!(message = this.mediaMessage)) return null;
                return Object.keys(message)[0];
              },
              enumerable: true,
            },
            id: {
              get() {
                return contextInfo.stanzaId;
              },
              enumerable: true,
            },
            chat: {
              get() {
                return contextInfo.remoteJid || self.chat;
              },
              enumerable: true,
            },
            isBaileys: {
              get() {
                return (
                  this.id?.length === 16 ||
                  (this.id?.startsWith("3EB0") && this.id.length === 22) ||
                  false
                );
              },
              enumerable: true,
            },
            sender: {
              get() {
                const raw = (contextInfo.participant || this.chat || "");
                return String(raw).decodeJid();
              },
              enumerable: true
            },
            fromMe: {
              get() {
                return areJidsSameUser(this.sender, self.conn?.user.jid);
              },
              enumerable: true,
            },
            text: {
              get() {
                return (
                  text ||
                  this.caption ||
                  this.contentText ||
                  this.selectedDisplayText ||
                  ""
                );
              },
              enumerable: true,
            },
            mentionedJid: {
              get() {
                let raw = q.contextInfo?.mentionedJid || self.getQuotedObj()?.mentionedJid || []
                return raw.map((jid: string) => String(jid).decodeJid())
              },
              enumerable: true
            },
            name: {
              get() {
                const sender = this.sender;
                return sender ? self.conn?.getName(sender) : null;
              },
              enumerable: true,
            },
            vM: {
              get() {
                return proto.WebMessageInfo.create({
                  key: {
                    fromMe: this.fromMe,
                    remoteJid: this.chat,
                    id: this.id,
                  },
                  message: quoted,
                  ...(self.isGroup
                    ? {
                      participant: this.sender,
                    }
                    : {}),
                });
              },
            },
            fakeObj: {
              get() {
                return this.vM;
              },
            },
            download: {
              value(saveToFile = false) {
                const mtype = this.mediaType;
                const mediaRoot = this.mediaMessage;
                if (!mtype || !mediaRoot || !mediaRoot[mtype]) {
                  throw new Error(
                    "No downloadable media found in quoted message. Reply to an image/video/sticker or resend the media.",
                  );
                }
                return self.conn?.downloadM(
                  mediaRoot[mtype],
                  mtype.replace(/message/i, ""),
                  saveToFile,
                );
              },
              enumerable: true,
              configurable: true,
            },
            reply: {
              value(text: string, chatId: string, options: string) {
                return self.conn?.reply(
                  chatId ? chatId : this.chat,
                  text,
                  this.vM,
                  options,
                );
              },
              enumerable: true,
            },
            copy: {
              value() {
                const M = proto.WebMessageInfo;
                return smsg(conn, M.create(M.toObject(this.vM)));
              },
              enumerable: true,
            },
            forward: {
              value(jid: string, force = false, options: any) {
                return self.conn?.sendMessage(
                  jid,
                  {
                    forward: this.vM,
                    force,
                    ...options,
                  },
                  {
                    ...options,
                  },
                );
              },
              enumerable: true,
            },
            copyNForward: {
              value(jid: string, forceForward = false, options: any) {
                return self.conn?.copyNForward(
                  jid,
                  this.vM,
                  forceForward,
                  options,
                );
              },
              enumerable: true,
            },
            cMod: {
              value(
                jid: string,
                text = "",
                sender = conn.sender,
                options = {},
              ) {
                return self.conn?.cMod(jid, this.vM, text, sender, options);
              },
              enumerable: true,
            },
            delete: {
              value() {
                return self.conn?.sendMessage(this.chat, {
                  delete: this.vM.key,
                });
              },
              enumerable: true,
            },
            react: {
              value(text: string) {
                return self.conn?.sendMessage(this.chat, {
                  react: {
                    text,
                    key: this.vM.key,
                  },
                });
              },
              enumerable: true,
            },
            command: {
              get() {
                const str2Regex = (str: string) =>
                  str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
                let _prefix = this.prefix ? this.prefix : global.prefix;
                let match = (
                  _prefix instanceof RegExp
                    ? [
                      [
                        _prefix.exec(
                          text ||
                          this.caption ||
                          this.contentText ||
                          this.selectedDisplayText ||
                          "",
                        ),
                        _prefix,
                      ],
                    ]
                    : Array.isArray(_prefix)
                      ? _prefix.map((p) => {
                        let re =
                          p instanceof RegExp ? p : new RegExp(str2Regex(p));
                        return [
                          re.exec(
                            text ||
                            this.caption ||
                            this.contentText ||
                            this.selectedDisplayText ||
                            "",
                          ),
                          re,
                        ];
                      })
                      : typeof _prefix === "string"
                        ? [
                          [
                            new RegExp(str2Regex(_prefix)).exec(
                              text ||
                              this.caption ||
                              this.contentText ||
                              this.selectedDisplayText ||
                              "",
                            ),
                            new RegExp(str2Regex(_prefix)),
                          ],
                        ]
                        : [
                          [
                            [],
                            // @ts-ignore
                            new RegExp(),
                          ],
                        ]
                ).find((p) => p[1]);
                let result =
                  ((opts?.["multiprefix"] ?? true) && (match!![0] || "")[0]) ||
                  ((opts?.["noprefix"] ?? false)
                    ? null
                    : (match!![0] || "")[0]);
                let noPrefix = !result
                  ? text ||
                  this.caption ||
                  this.contentText ||
                  this.selectedDisplayText ||
                  ""
                  : (
                    text ||
                    this.caption ||
                    this.contentText ||
                    this.selectedDisplayText ||
                    ""
                  ).replace(result, "");
                let args_v2 = noPrefix.trim().split(/ +/);
                let [command, ...args] = noPrefix
                  .trim()
                  .split(" ")
                  .filter((v: any) => v);
                return {
                  command,
                  args,
                  args_v2,
                  noPrefix,
                  match,
                };
              },
              enumerable: true,
            },
            device: {
              get() {
                const device = getDevice(this.vM.key?.id);
                const platform = os.platform();
                const isUnknownDevice = device === "unknown" && platform;
                const res = device
                  ? isUnknownDevice
                    ? platform === "android"
                      ? "Android"
                      : ["win32", "darwin", "linux"].includes(platform)
                        ? "Desktop"
                        : "Unknown"
                    : device
                  : "Unknown Device";

                return res;
              },
              enumerable: true,
            },
            isBot: {
              get() {
                const idBot = this.vM.key?.id;
                return ["3EB0"].some(
                  (k) =>
                    idBot.includes(k) && this.sender !== this.conn?.user.jid,
                );
              },
              enumerable: true,
            },
          },
        );
      },
      enumerable: true,
    },
    _text: {
      value: null,
      writable: true,
    },
    text: {
      get() {
        const msg = this.msg;
        const text =
          (typeof msg === "string" ? msg : msg?.text) ||
          msg?.caption ||
          msg?.contentText ||
          "";
        return typeof this._text === "string"
          ? this._text
          // @ts-ignore
          : "" ||
          (typeof text === "string"
            ? text
            : text?.selectedDisplayText ||
            text?.hydratedTemplate?.hydratedContentText ||
            text) ||
          "";
      },
      set(str) {
        return (this._text = str);
      },
      enumerable: true,
    },
    mentionedJid: {
      get() {
        let raw = this.msg?.contextInfo?.mentionedJid?.length && this.msg.contextInfo.mentionedJid || [];
        return raw.map((jid: string) => String(jid).decodeJid());
      },
      enumerable: true
    },
    name: {
      get() {
        return (
          (!nullish(this.pushName) && this.pushName) ||
          this.conn?.getName(this.sender)
        );
      },
      enumerable: true,
    },
    download: {
      value(saveToFile = false) {
        const mtype = this.mediaType;
        const mediaRoot = this.mediaMessage;
        if (!mtype || !mediaRoot || !mediaRoot[mtype]) {
          throw new Error(
            "No downloadable media found in message. Send or reply to an image/video/sticker.",
          );
        }
        return this.conn?.downloadM(
          mediaRoot[mtype],
          mtype.replace(/message/i, ""),
          saveToFile,
        );
      },
      enumerable: true,
      configurable: true,
    },
    reply: {
      value(
        text: string,
        chatId: string,
        options: MiscMessageGenerationOptions,
      ) {
        return this.conn?.reply(
          chatId ? chatId : this.chat,
          text,
          this,
          options,
        );
      },
    },
    copy: {
      value() {
        const M = proto.WebMessageInfo;
        return smsg(this.conn, M.create(M.toObject(this)));
      },
      enumerable: true,
    },
    forward: {
      value(jid: string, force = false, options = {}) {
        return this.conn?.sendMessage(
          jid,
          {
            forward: this,
            force,
            ...options,
          },
          {
            ...options,
          },
        );
      },
      enumerable: true,
    },
    copyNForward: {
      value(jid: string, forceForward = false, options = {}) {
        return this.conn?.copyNForward(jid, this, forceForward, options);
      },
      enumerable: true,
    },
    cMod: {
      value(jid: string, text = "", sender = conn.sender, options = {}) {
        return this.conn?.cMod(jid, this, text, sender, options);
      },
      enumerable: true,
    },
    getQuotedObj: {
      value() {
        if (!this.quoted.id) return null;
        const q = proto.WebMessageInfo.create(
          this.conn?.loadMessage(this.quoted.id) || this.quoted.vM,
        );
        return smsg(this.conn, q);
      },
      enumerable: true,
    },
    getQuotedMessage: {
      get() {
        return this.getQuotedObj;
      },
    },
    delete: {
      value() {
        return this.conn?.sendMessage(this.chat, {
          delete: this.key,
        });
      },
      enumerable: true,
    },
    react: {
      value(text: string) {
        return this.conn?.sendMessage(this.chat, {
          react: {
            text,
            key: this.key,
          },
        });
      },
      enumerable: true,
    },
    device: {
      get() {
        const device = getDevice(this.key?.id);
        const platform = os.platform();
        const isUnknownDevice = device === "unknown" && platform;
        const res = device
          ? isUnknownDevice
            ? platform === "android"
              ? "Android Device"
              : ["win32", "darwin", "linux"].includes(platform)
                ? "Desktop"
                : "Unknown Device"
            : device
          : "Unknown Device";

        return res;
      },
      enumerable: true,
    },
    isBot: {
      get() {
        const idBot = this.key?.id;
        return ["3EB0"].some(
          (k) => idBot.includes(k) && this.sender !== this.conn?.user.jid,
        );
      },
      enumerable: true,
    },
  });
}

export function logic(check: any, inp: any, out: any) {
  if (inp.length !== out.length)
    throw new Error("Input and Output must have same length");
  for (let i in inp) if (util.isDeepStrictEqual(check, inp[i])) return out[i];
  return null;
}

export function protoType() {
  Buffer.prototype.toArrayBuffer = function toArrayBufferV2() {
    const ab = new ArrayBuffer(this.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < this.length; ++i) {
      view[i] = this[i];
    }
    return ab;
  };

  Buffer.prototype.toArrayBufferV2 = function toArrayBuffer() {
    return this.buffer.slice(
      this.byteOffset,
      this.byteOffset + this.byteLength,
    );
  };

  ArrayBuffer.prototype.toBuffer = function toBuffer() {
    return Buffer.from(new Uint8Array(this));
  };

  Uint8Array.prototype.getFileType =
    ArrayBuffer.prototype.getFileType =
    Buffer.prototype.getFileType =
    async function getFileType() {
      return await fileTypeFromBuffer(this);
    };

  String.prototype.isNumber = Number.prototype.isNumber = isNumber;

  String.prototype.capitalize = function capitalize() {
    return this.charAt(0).toUpperCase() + this.slice(1, this.length);
  };

  String.prototype.capitalizeV2 = function capitalizeV2() {
    const str = this.split(" ");
    return str.map((v: any) => v.capitalize()).join(" ");
  };
  String.prototype.decodeJid = function decodeJid() {
    if (/:\d+@/gi.test(this)) {
      const decode = jidDecode(this) || {
        server: "s.whatsapp.net",
        user: "",
      };

      const result = decode.user && decode.server
        ? `${decode.user}@${decode.server}`
        : this.toString();

      return result.trim();
    } else {
      return this.trim();
    }
  };

  Number.prototype.toTimeString = function toTimeString() {
    const seconds = Math.floor((this / 1000) % 60);
    const minutes = Math.floor((this / (60 * 1000)) % 60);
    const hours = Math.floor((this / (60 * 60 * 1000)) % 24);
    const days = Math.floor(this / (24 * 60 * 60 * 1000));
    return (
      (days ? `${days} day(s) ` : "") +
      (hours ? `${hours} hour(s) ` : "") +
      (minutes ? `${minutes} minute(s) ` : "") +
      (seconds ? `${seconds} second(s)` : "")
    ).trim();
  };
  Number.prototype.getRandom =
    String.prototype.getRandom =
    Array.prototype.getRandom =
    getRandom;
}
function isNumber() {
  const int = parseInt(this);
  return typeof int === "number" && !isNaN(int);
}

function getRandom() {
  if (Array.isArray(this) || this instanceof String)
    return this[Math.floor(Math.random() * this.length)];
  return Math.floor(Math.random() * this);
}

function nullish(args: any): boolean {
  return !(args !== null && args !== undefined);
}
