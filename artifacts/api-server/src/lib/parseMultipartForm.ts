import Busboy from "busboy";
import type { Request } from "express";

export type ParsedMultipartFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

export type ParsedMultipartForm = {
  fields: Record<string, string>;
  file: ParsedMultipartFile | null;
};

/**
 * Ein Datei-Feld + Textfelder aus multipart/form-data (max. eine Datei).
 */
export function parseMultipartForm(
  req: Request,
  opts: { maxFileBytes: number },
): Promise<ParsedMultipartForm> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: ParsedMultipartFile | null = null;
    let fileDone = false;
    let finished = false;

    const done = () => {
      if (!finished && fileDone) {
        finished = true;
        resolve({ fields, file });
      }
    };

    const busboy = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: opts.maxFileBytes, fields: 20, fieldSize: 4096 },
    });

    busboy.on("field", (name, value) => {
      fields[name] = String(value ?? "").trim();
    });

    busboy.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      let tooLarge = false;
      stream.on("data", (chunk: Buffer) => {
        if (!tooLarge) chunks.push(chunk);
      });
      stream.on("limit", () => {
        tooLarge = true;
        reject(new Error("file_too_large"));
      });
      stream.on("end", () => {
        if (!tooLarge) {
          file = {
            buffer: Buffer.concat(chunks),
            fileName: String(info.filename ?? "upload").trim() || "upload",
            mimeType: String(info.mimeType ?? "application/octet-stream").trim(),
          };
        }
        fileDone = true;
        done();
      });
    });

    busboy.on("finish", () => {
      if (!fileDone) {
        fileDone = true;
        done();
      }
    });

    busboy.on("error", (err) => reject(err));
    req.pipe(busboy);
  });
}
