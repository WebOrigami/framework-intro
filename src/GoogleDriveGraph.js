import { ExplorableGraph } from "@graphorigami/origami";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import gsheet from "./gsheet.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const keyFile = path.join(dirname, "credentials.json");
const scopes = ["https://www.googleapis.com/auth/drive.readonly"];

// Create a service account initialize with the service account key file and scope needed
const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: scopes,
});
const driveService = google.drive({ version: "v3", auth });

export default class GoogleDriveGraph {
  constructor(folderId) {
    this.folderId = folderId;
    this.items = null;
  }

  async *[Symbol.asyncIterator]() {
    const items = await this.getItems();
    yield* await ExplorableGraph.keys(items);
  }

  async get(key) {
    const items = await this.getItems();
    const item = items[key];
    if (!item) {
      return undefined;
    }

    const googleFileTypes = {
      "application/vnd.google-apps.spreadsheet": gsheet,
      "application/vnd.google-apps.folder": (id) => new GoogleDriveGraph(id),
    };
    const loader = googleFileTypes[item.mimeType] || getGoogleDriveFile;
    const value = await loader(item.id);
    return value;
  }

  async getItems() {
    if (this.items) {
      return this.items;
    }

    const params = {
      q: `'${this.folderId}' in parents and trashed = false`,
      fields: "files/id,files/name,files/mimeType",
      orderBy: "name",
    };
    const response = await driveService.files.list(params);

    this.items = {};
    for (const file of response.data.files) {
      const { name, id, mimeType } = file;
      this.items[name] = { id, mimeType };
    }

    return this.items;
  }
}

async function getGoogleDriveFile(fileId) {
  const params = {
    alt: "media",
    fileId,
  };
  const options = {
    responseType: "arraybuffer",
  };
  let response;
  try {
    response = await driveService.files.get(params, options);
  } catch (e) {
    const message = `Error ${e.code}  ${e.response.statusText} getting file ${fileId}: ${e.message}`;
    console.error(message);
    return undefined;
  }
  let buffer = response.data;
  if (buffer instanceof ArrayBuffer) {
    buffer = Buffer.from(buffer);
  }
  return buffer;
}
