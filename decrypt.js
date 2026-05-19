// Decryption helper — depends on CryptoJS (lib/crypto-js.js) and sm4 (lib/sm4.js).
const DECRYPTOR = {
  decrypt(base64Str, algorithm, key) {
    if (!base64Str || !key) return null;
    try {
      if (algorithm === "SM4") return this._sm4Decrypt(base64Str, key);
      if (algorithm === "AES") return this._aesDecrypt(base64Str, key);
    } catch {
      return null;
    }
    return null;
  },

  _stringToHex(str) {
    let hex = "";
    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return hex;
  },

  // SM4-ECB: Base64 → UTF-8 hex string → SM4 decrypt
  _sm4Decrypt(data, key) {
    const words = CryptoJS.enc.Base64.parse(data);
    const hexStr = CryptoJS.enc.Utf8.stringify(words);
    return sm4.decrypt(hexStr, this._stringToHex(key));
  },

  // AES-128-ECB-PKCS7: Base64 → AES decrypt
  _aesDecrypt(data, key) {
    const words = CryptoJS.enc.Base64.parse(data);
    const cryptoKey = CryptoJS.enc.Utf8.parse(key);
    return CryptoJS.AES.decrypt({ ciphertext: words }, cryptoKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  },
};
