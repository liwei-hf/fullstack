const MOJIBAKE_PATTERN =
  /[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/;

function countCjkCharacters(value: string) {
  return (value.match(/[\u3400-\u9fff]/g) || []).length;
}

function isPrintableText(value: string) {
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
}

/**
 * 浏览器上传中文文件名时，multer 在部分环境下会把 UTF-8 按 latin1 解码，
 * 最终出现“æµè¯ææ¡£.pdf”这类经典乱码。这里统一做一次兜底修正。
 */
export function normalizeDocumentFileName(fileName: string) {
  if (!fileName || !MOJIBAKE_PATTERN.test(fileName)) {
    return fileName;
  }

  try {
    const decoded = Buffer.from(fileName, 'latin1').toString('utf8');

    if (!decoded || decoded.includes('\uFFFD') || !isPrintableText(decoded)) {
      return fileName;
    }

    return countCjkCharacters(decoded) >= countCjkCharacters(fileName) ? decoded : fileName;
  } catch {
    return fileName;
  }
}
